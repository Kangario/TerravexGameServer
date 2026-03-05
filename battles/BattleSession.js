import { BattleState } from "./BattlePhase/BattleState.js";
import { TurnProcessor } from "./TurnController/TurnProcessor.js";
import { gsRedis, userRedis } from "../config/redis.js";
import {BattleEventDispatcher} from "./Actions/BattleEventDispatcher.js";
import {BattleActionProcessor} from "./Actions/BattleActionProcessor.js";

const REWARDS_SERVER_URL = "https://terravexgamerewards.onrender.com";
const WINNER_XP_PER_SURVIVOR = 50;
const WINNER_GOLD_REWARD = 100;
const WINNER_RATING_REWARD = 100;
const LOSER_RATING_PENALTY = 100;

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
        this.players = new Map(); // userId -> ws
        this.contexPlayers = new Map();
        this.deployment = {readyPlayers: new Set() };
        this.timer = null;
        this.finishedCallback = null;
        this.battleResultSent = false;
        
        log("CONSTRUCTOR END", {
            matchId: snapshot.matchId,
            initialPhase: this.phase
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
        log("BATTLE START");
        this.startDeployment();
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
        
        this.players.set(userId, ws);
        log("PLAYER ADDED", {
            userId,
            totalPlayers: this.players.size
        });
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }
        ws.send(JSON.stringify({
            type: "battle_init",
            teamId,
            state: this.state.toClientState()
        }));
    }

    reconnectPlayer(ws, userId) {
        this.players.set(userId, ws);
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }
        log("PLAYER RECONNECTED", {
            userId,
            totalPlayers: this.players.size
        });
        ws.send(JSON.stringify({
            type: "battle_init",
            teamId,
            state: this.state.toClientState()
        }));
    }

    disconnectPlayer(userId) {
        this.players.delete(userId);
        const teamId = this.contexPlayers.get(userId);
        if (teamId === undefined) {
            log("INVALID TEAM ID", { userId });
            return this.reject(userId, "You are not part of this match");
        }
        log("PLAYER DISCONNECTED", {
            userId,
            teamId,
            totalPlayers: this.players.size
        });
    }

    broadcast(payload) {
        log("BROADCAST", {
            type: payload.type,
            players: this.players.size
        });

        const msg = JSON.stringify(payload);
        this.players.forEach(ws => ws.send(msg));
    }

    sendToPlayer(userId, payload) {
        const ws = this.players.get(userId);
        if (!ws) {
            return;
        }

        ws.send(JSON.stringify(payload));
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
