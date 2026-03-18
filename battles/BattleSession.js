import { BattleState } from "./BattlePhase/BattleState.js";
import { TurnProcessor } from "./TurnController/TurnProcessor.js";
import { gsRedis, userRedis } from "../config/redis.js";
import {BattleEventDispatcher} from "./Actions/BattleEventDispatcher.js";
import {BattleActionProcessor} from "./Actions/BattleActionProcessor.js";
import { randomUUID } from "crypto";

const REWARDS_SERVER_URL = "https://terravexgamerewards.onrender.com";
const WINNER_XP_PER_SURVIVOR = 50;
const WINNER_GOLD_REWARD = 100;
const WINNER_RATING_REWARD = 100;
const LOSER_RATING_PENALTY = 100;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 30000);
const DEPLOYMENT_DURATION_MS = 45000;
const DEPLOYMENT_ALLOWED_ROWS = [[0, 1], [38, 39]];

function log(stage, data = {}) {
    console.log(
        `[BattleSession][${new Date().toISOString()}] ${stage}`,
        data
    );
}

export class BattleSession {

    static async create(snapshot) {
        const session = new BattleSession(snapshot);
        session.contexPlayers = await session.loadPlayerTeamsMap(snapshot.matchId);
        session.initializePlayerRegistry();
        return session;
    }
    
    constructor(snapshot) {
        if (!snapshot) {
            throw new Error("BattleSession: snapshot is required");
        }

        log("CONSTRUCTOR START", {
            matchId: snapshot.matchId,
            unitsCount: snapshot.units?.length
        });
        
        this.snapshot = snapshot;
        this.state = new BattleState({ snapshot });
        this.events = [];
        
        this.phase = "INIT";
        this.players = new Map(); // userId -> ws | null
        this.playerPresence = new Map(); // userId -> connection metadata
        this.contexPlayers = new Map();
        this.deployment = {readyPlayers: new Set() };
        this.timer = null;
        this.finishedCallback = null;
        this.battleResultSent = false;
        this.started = false;
        
        log("CONSTRUCTOR END", {
            matchId: snapshot.matchId,
            initialPhase: this.phase
        });
        
    }

    initializePlayerRegistry() {
        for (const userId of this.contexPlayers.keys()) {
            this.ensurePlayerPresence(userId);
            if (!this.players.has(userId)) {
                this.players.set(userId, null);
            }
        }
    }

    ensurePlayerPresence(userId) {
        if (!this.playerPresence.has(userId)) {
            this.playerPresence.set(userId, {
                connected: false,
                sessionToken: randomUUID(),
                reconnectDeadlineAt: null,
                disconnectTimer: null
            });
        }

        return this.playerPresence.get(userId);
    }

    clearDisconnectTimer(userId) {
        const presence = this.playerPresence.get(userId);
        if (!presence?.disconnectTimer) {
            return;
        }

        clearTimeout(presence.disconnectTimer);
        presence.disconnectTimer = null;
    }

    attachSocket(userId, ws) {
        const previousSocket = this.players.get(userId);
        const presence = this.ensurePlayerPresence(userId);

        this.clearDisconnectTimer(userId);
        presence.connected = true;
        presence.reconnectDeadlineAt = null;

        this.players.set(userId, ws);

        if (previousSocket && previousSocket !== ws && typeof previousSocket.close === "function") {
            try {
                previousSocket.close(4001, "Replaced by a newer connection");
            } catch (err) {
                log("FAILED TO CLOSE PREVIOUS SOCKET", {
                    userId,
                    error: err.message
                });
            }
        }
    }

    buildBattleInitPayload(userId) {
        const teamId = this.contexPlayers.get(userId);
        const presence = this.ensurePlayerPresence(userId);

        return {
            type: "battle_init",
            teamId,
            phase: this.phase,
            state: this.state.toClientState(),
            reconnect: {
                sessionToken: presence.sessionToken,
                graceMs: RECONNECT_GRACE_MS
            },
            players: this.getPlayersConnectionState()
        };
    }

    getPlayersConnectionState() {
        return [...this.contexPlayers.keys()].map((userId) => {
            const presence = this.ensurePlayerPresence(userId);

            return {
                userId,
                connected: presence.connected,
                reconnectDeadlineAt: presence.reconnectDeadlineAt
            };
        });
    }

    broadcastPlayerConnectionState(userId) {
        const presence = this.ensurePlayerPresence(userId);

        this.broadcast({
            type: "player_connection",
            userId,
            connected: presence.connected,
            reconnectDeadlineAt: presence.reconnectDeadlineAt
        });
    }

    async loadPlayerTeamsMap(matchId) {
        if (!matchId) {
            throw new Error("loadPlayerTeamsMap: matchId is required");
        }

        const redisKey = `gs:match:${matchId}`;

        const raw = await gsRedis.get(redisKey);
        if (!raw) {
            throw new Error(`Match ${matchId} not found in Redis`);
        }

        let match;
        try {
            match = JSON.parse(raw);
        } catch (err) {
            throw new Error(`Invalid JSON for match ${matchId}`);
        }

        if (!Array.isArray(match.players)) {
            throw new Error(`Match ${matchId} has no players array`);
        }

        const map = new Map();

        for (const player of match.players) {
            if (!player?.userId) {
                throw new Error(`Invalid player entry in match ${matchId}`);
            }

            if (typeof player.teamId !== "number") {
                throw new Error(
                    `Missing teamId for user ${player.userId} in match ${matchId}`
                );
            }

            if (map.has(player.userId)) {
                throw new Error(
                    `Duplicate userId ${player.userId} in match ${matchId}`
                );
            }

            map.set(player.userId, player.teamId);
        }

        return map;
    }
    // =========================
    // LIFECYCLE
    // =========================
    startBattle() {
        if (this.started) {
            return;
        }

        this.started = true;

        log("BATTLE START");
        this.startDeployment();
    }

    startDeployment() {
        if (this.phase !== "INIT") {
            return;
        }

        this.applyEvents([{
            type: "DEPLOYMENT",
            duration: DEPLOYMENT_DURATION_MS,
            allowedRows: DEPLOYMENT_ALLOWED_ROWS
        }]);
    }

    handleAction(action) {

        const result = BattleActionProcessor.process({
            session: this,
            action
        });

        this.applyEvents(result.events);
    }

    applyEvents(initialEvents) {

        const queue = [...initialEvents];
        const processed = [];

        while (queue.length > 0) {

            const event = queue.shift();

            const newEvents = BattleEventDispatcher.apply(this, event);

            processed.push(event);

            if (newEvents && newEvents.length > 0) {

                queue.push(...newEvents);
            }
        }

        this.events.push(...processed);

        this.broadcast({
            type: "events",
            events: processed
        });

        // Timer logic

        if (processed.some(e => e.type === "turn_start")) {

            clearTimeout(this.timer);

            this.timer = setTimeout(() => {

                this.applyEvents([
                    { type: "turn_end" }
                ]);

            }, 40000);
        }
    }

    setTimeTurn(value){
        this.timer = setTimeout(() => {

            this.applyEvents([
                { type: "await_player" }
            ]);

        }, value);
    }
    
    finishBattle() {
        if (this.battleResultSent) {
            return;
        }

        this.battleResultSent = true;
        
        this.phase = "BATTLE_END";

        log("BATTLE FINISH", {
            winnerTeam: this.state.winnerTeam
        });
        
        const winners = [];
        const losers = [];

        for (const [userId, teamId] of this.contexPlayers.entries()) {
            if (teamId === this.state.winnerTeam) {
                winners.push(userId);
            } else {
                losers.push(userId);
            }
        }


        this.broadcast({
            type: "battle_end",
            winnerTeam: this.state.winnerTeam,
            winners,
            losers
        });

        for (const userId of winners) {
            this.sendToPlayer(userId, {
                type: "battle_result",
                result: "win",
                winnerTeam: this.state.winnerTeam
            });
        }

        for (const userId of losers) {
            this.sendToPlayer(userId, {
                type: "battle_result",
                result: "lose",
                winnerTeam: this.state.winnerTeam
            });
        }

        this.enqueueBattleRewards({ winners, losers }).catch((err) => {
            console.error("[BattleSession] enqueueBattleRewards failed", err);
        });
        
        if (this.finishedCallback) {
            log("FINISHED CALLBACK CALLED");
            this.finishedCallback();
        }
    }

    onFinished(callback) {
        log("ON FINISHED REGISTERED");
        this.finishedCallback = callback;
    }

    // =========================
    // PLAYERS
    // =========================
    addPlayer(userId, ws) {
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }

        this.attachSocket(userId, ws);
        log("PLAYER ADDED", {
            userId,
            totalPlayers: this.players.size,
            connectedPlayers: this.getConnectedPlayersCount()
        });

        this.sendToSocket(ws, this.buildBattleInitPayload(userId));
        this.broadcastPlayerConnectionState(userId);
    }

    reconnectPlayer(ws, userId, sessionToken) {
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }

        const presence = this.ensurePlayerPresence(userId);
        if (!sessionToken || sessionToken !== presence.sessionToken) {
            this.sendToSocket(ws, {
                type: "error",
                message: "Reconnect rejected: invalid session token"
            });
            return false;
        }

        if (presence.reconnectDeadlineAt && Date.now() > presence.reconnectDeadlineAt) {
            this.sendToSocket(ws, {
                type: "error",
                message: "Reconnect rejected: reconnect window expired"
            });
            return false;
        }

        this.attachSocket(userId, ws);

        log("PLAYER RECONNECTED", {
            userId,
            totalPlayers: this.players.size,
            connectedPlayers: this.getConnectedPlayersCount()
        });

        this.sendToSocket(ws, this.buildBattleInitPayload(userId));
        this.broadcastPlayerConnectionState(userId);
        return true;
    }

    disconnectPlayer(userId, ws) {
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }

        const currentSocket = this.players.get(userId);
        if (currentSocket && ws && currentSocket !== ws) {
            return;
        }

        const presence = this.ensurePlayerPresence(userId);

        this.players.set(userId, null);
        presence.connected = false;
        presence.reconnectDeadlineAt = Date.now() + RECONNECT_GRACE_MS;
        this.clearDisconnectTimer(userId);
        presence.disconnectTimer = setTimeout(() => {
            const latestPresence = this.ensurePlayerPresence(userId);
            latestPresence.disconnectTimer = null;

            if (latestPresence.connected) {
                return;
            }

            latestPresence.reconnectDeadlineAt = Date.now();
            this.broadcast({
                type: "player_reconnect_expired",
                userId
            });
        }, RECONNECT_GRACE_MS);

        log("PLAYER DISCONNECTED", {
            userId,
            teamId,
            totalPlayers: this.players.size,
            connectedPlayers: this.getConnectedPlayersCount(),
            reconnectDeadlineAt: presence.reconnectDeadlineAt
        });

        this.broadcastPlayerConnectionState(userId);
    }

    broadcast(payload) {
        log("BROADCAST", {
            type: payload.type,
            players: this.getConnectedPlayersCount()
        });

        const msg = JSON.stringify(payload);
        this.players.forEach((ws) => {
            if (ws) {
                this.sendRaw(ws, msg);
            }
        });
    }

    sendToPlayer(userId, payload) {
        const ws = this.players.get(userId);
        if (!ws) {
            return;
        }

        this.sendToSocket(ws, payload);
    }

    sendToSocket(ws, payload) {
        this.sendRaw(ws, JSON.stringify(payload));
    }

    sendRaw(ws, rawPayload) {
        if (!ws || typeof ws.send !== "function") {
            return;
        }

        try {
            ws.send(rawPayload);
        } catch (err) {
            log("SEND FAILED", {
                error: err.message
            });
        }
    }

    getConnectedPlayersCount() {
        let count = 0;

        for (const ws of this.players.values()) {
            if (ws) {
                count += 1;
            }
        }

        return count;
    }

    async enqueueBattleRewards({ winners, losers }) {
        const tasks = [];
        const rewardsPlan = this.buildRewardsPlan({ winners, losers });

        for (const winnerId of winners) {
            const reward = rewardsPlan.get(winnerId);
            if (!reward) continue;

            tasks.push(this.applyRewardsToUserRedis(winnerId, reward));
            tasks.push(this.createReward(winnerId, "battle_win", {
                matchId: this.snapshot.matchId,
                winnerTeam: this.state.winnerTeam,
                outcome: "win",
                rewards: reward
            }));

            for (const loserId of losers) {
                const reward = rewardsPlan.get(loserId);
                if (!reward) continue;

                tasks.push(this.applyRewardsToUserRedis(loserId, reward));
                tasks.push(this.createReward(loserId, "battle_loss", {
                    matchId: this.snapshot.matchId,
                    winnerTeam: this.state.winnerTeam,
                    outcome: "lose",
                    rewards: reward
            }));
        }

        await Promise.allSettled(tasks);
    }
    }
    buildRewardsPlan({ winners, losers }) {
        const aliveUnitsByOwner = this.collectAliveUnitsByOwner();
        const allUnitsByOwner = this.collectAllUnitsByOwner();
        const plan = new Map();

        for (const userId of winners) {
            const aliveUnits = aliveUnitsByOwner.get(userId) || [];

            plan.set(userId, {
                goldDelta: WINNER_GOLD_REWARD,
                ratingDelta: WINNER_RATING_REWARD,
                victoriesDelta: 1,
                defeatsDelta: 0,
                survivorXp: aliveUnits.map(unit => ({
                    heroId: unit.heroId,
                    instanceId: unit.instanceId,
                    xpDelta: WINNER_XP_PER_SURVIVOR
                })),
                removedHeroes: []
            });
        }

        for (const userId of losers) {
            const allUnits = allUnitsByOwner.get(userId) || [];
            const aliveUnits = aliveUnitsByOwner.get(userId) || [];
            const aliveKeys = new Set(aliveUnits.map(unit => unit.identityKey));

            const deadUnits = allUnits.filter(unit => !aliveKeys.has(unit.identityKey));

            plan.set(userId, {
                goldDelta: 0,
                ratingDelta: -LOSER_RATING_PENALTY,
                victoriesDelta: 0,
                defeatsDelta: 1,
                survivorXp: [],
                removedHeroes: deadUnits.map(unit => ({
                    heroId: unit.heroId,
                    instanceId: unit.instanceId
                }))
            });
        }

        return plan;
    }

    collectAliveUnitsByOwner() {
        const result = new Map();

        for (const unit of this.state.units.values()) {
            const ownerId = unit.ownerId;
            if (!ownerId) continue;

            const item = {
                heroId: unit.id,
                instanceId: unit.instanceId ?? null,
                identityKey: this.makeUnitIdentityKey(unit)
            };

            if (!result.has(ownerId)) {
                result.set(ownerId, []);
            }

            result.get(ownerId).push(item);
        }

        return result;
    }

    collectAllUnitsByOwner() {
        const result = new Map();

        for (const unit of this.snapshot.units || []) {
            const ownerId = unit.playerId ?? unit.ownerId;
            if (!ownerId) continue;

            const item = {
                heroId: unit.heroId ?? unit.id ?? unit.Id ?? null,
                instanceId: unit.instanceId ?? unit.InstanceId ?? null,
                identityKey: this.makeUnitIdentityKey(unit)
            };

            if (!result.has(ownerId)) {
                result.set(ownerId, []);
            }

            result.get(ownerId).push(item);
        }

        return result;
    }

    makeUnitIdentityKey(unit) {
        const instanceId = unit.instanceId ?? unit.InstanceId ?? null;
        if (instanceId) {
            return `instance:${instanceId}`;
        }

        const heroId = unit.heroId ?? unit.id ?? unit.Id ?? null;
        if (heroId !== null && heroId !== undefined) {
            return `hero:${heroId}`;
        }

        return `fallback:${JSON.stringify(unit)}`;
    }

    async applyRewardsToUserRedis(userId, reward) {
        const key = await this.resolveUserRedisKey(userId);
        const raw = await userRedis.get(key);

        if (!raw) {
            throw new Error(`User ${userId} not found in userRedis by key ${key}`);
        }

        const user = JSON.parse(raw);

        user.gold = Number(user.gold || 0) + Number(reward.goldDelta || 0);
        user.rating = Number(user.rating || 0) + Number(reward.ratingDelta || 0);
        user.victories = Number(user.victories || 0) + Number(reward.victoriesDelta || 0);
        user.defeats = Number(user.defeats || 0) + Number(reward.defeatsDelta || 0);

        const arraysToUpdate = ["equipmentHeroes", "heroesBought"];

        for (const arrayName of arraysToUpdate) {
            const heroes = Array.isArray(user[arrayName]) ? user[arrayName] : [];
            const survivors = [];

            for (const hero of heroes) {
                if (this.isHeroRemoved(hero, reward.removedHeroes)) {
                    continue;
                }

                const xpDelta = this.getHeroXpDelta(hero, reward.survivorXp);
                if (xpDelta > 0) {
                    hero.Xp = Number(hero.Xp || 0) + xpDelta;
                }

                survivors.push(hero);
            }

            user[arrayName] = survivors;
        }

        await userRedis.set(key, JSON.stringify(user));
    }

    async resolveUserRedisKey(userId) {
        const candidates = [
            userId,
            `user:${userId}`,
            `users:${userId}`,
            `profile:${userId}`
        ];

        for (const key of candidates) {
            if (!key) continue;

            const exists = await userRedis.exists(key);
            if (exists) {
                return key;
            }
        }

        return userId;
    }

    isHeroRemoved(hero, removedHeroes) {
        return removedHeroes.some((removed) => {
            const sameInstance =
                removed.instanceId &&
                (hero.InstanceId === removed.instanceId || hero.instanceId === removed.instanceId);

            if (sameInstance) {
                return true;
            }

            return removed.heroId !== null && removed.heroId !== undefined &&
                (hero.Id === removed.heroId || hero.id === removed.heroId);
        });
    }

    getHeroXpDelta(hero, survivorXp) {
        for (const reward of survivorXp) {
            const sameInstance =
                reward.instanceId &&
                (hero.InstanceId === reward.instanceId || hero.instanceId === reward.instanceId);

            if (sameInstance) {
                return reward.xpDelta;
            }

            if (reward.heroId !== null && reward.heroId !== undefined &&
                (hero.Id === reward.heroId || hero.id === reward.heroId)) {
                return reward.xpDelta;
            }
        }

        return 0;
    }
    
    
    
    async createReward(playerId, rewardType, payload) {
        const response = await fetch(`${REWARDS_SERVER_URL}/rewards/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                playerId,
                rewardType,
                payload
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Rewards server returned ${response.status}: ${errorBody}`);
        }
    }
    
    // =========================
    // TURN FLOW
    // =========================
    advanceToTurnStart() {
        if (this.state.finished) {
            log("ADVANCE TURN → BATTLE FINISHED");
            this.finishBattle();
            return;
        }
        

        log("TURN START PHASE", {
            activeUnitId: this.state.activeUnitId,
            turn: this.state.turnNumber + 1
        });
        
        this.state.startTurn();

        this.broadcast({
            type: "turn_start",
            unitId: this.state.activeUnitId,
            ap: this.state.getActiveUnit().ap
        });

        this.phase = "AWAIT_TURN_ACTIONS";

        log("AWAIT TURN ACTIONS", {
            activeUnitId: this.state.activeUnitId
        });
    }

    // =========================
    // CLIENT INPUT
    // =========================
    handleTurnActions(userId, msg) {
        log("HANDLE TURN ACTIONS", {
            userId,
            phase: this.phase,
            msgUnitId: msg.unitId
        });

        if (this.phase !== "AWAIT_TURN_ACTIONS") {
            log("REJECT ACTIONS — WRONG PHASE", {
                phase: this.phase
            });
            return this.reject(userId, "Not accepting actions now");
        }

        const activeUnit = this.state.getActiveUnit();

        if (msg.unitId !== activeUnit.id) {
            log("REJECT ACTIONS — NOT YOUR TURN", {
                userId,
                expectedUnit: activeUnit.id,
                got: msg.unitId
            });
            return this.reject(userId, "Not your unit's turn");
        }

        this.phase = "RESOLVE_TURN";

        log("RESOLVE TURN", {
            unitId: activeUnit.id,
            actionsCount: msg.actions?.length
        });

        const result = TurnProcessor.process({
            state: this.state,
            actions: msg.actions
        });

        this.broadcast({
            type: "turn_result",
            unitId: activeUnit.id,
            events: result.events,
            state: this.state.toClientState()
        });

        this.state.endTurn();
        this.advanceToTurnStart();
    }

    reject(userId, reason) {
        log("REJECT", {
            userId,
            reason
        });

        const ws = this.players.get(userId);
        if (!ws) return;

        ws.send(JSON.stringify({
            type: "error",
            message: reason
        }));
    }
}
