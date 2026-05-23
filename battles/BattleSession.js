import { BattleState } from "./BattlePhase/BattleState.js";
import { TurnProcessor } from "./TurnController/TurnProcessor.js";
import { CombatRules } from "./CombatRules.js";
import {BattleEventDispatcher} from "./Actions/BattleEventDispatcher.js";
import {BattleActionProcessor} from "./Actions/BattleActionProcessor.js";
import { BattleRewardClient } from "./Rewards/BattleRewardClient.js";
import { randomUUID } from "crypto";

const XP_PER_KILL = 50;
const WINNER_GOLD_REWARD = 100;
const WINNER_RATING_REWARD = 100;
const LOSER_RATING_PENALTY = 100;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 30000);
const DEPLOYMENT_DURATION_MS = 45000;
const DEPLOYMENT_ALLOWED_ROWS = [[0, 1], [38, 39]];
const TURN_DURATION_MS = 40000;

function log(stage, data = {}) {
    console.log(
        `[BattleSession][${new Date().toISOString()}] ${stage}`,
        data
    );
}

export class BattleSession {

    static async create(snapshot) {
        const session = new BattleSession(snapshot);
        session.contexPlayers = session.buildPlayerTeamsMap(snapshot.players);
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
        this.rewardClient = new BattleRewardClient();
        this.battleResultSent = false;
        this.started = false;
        this.phaseTimerKind = null;
        this.phaseDeadlineAt = null;
        this.phaseDurationMs = null;
        this.pendingBattleEndDeadUnitIds = [];
        this.unitKillCounts = new Map();
        
        log("CONSTRUCTOR END", {
            matchId: snapshot.matchId,
            initialPhase: this.phase
        });
        
    }

    initializePlayerRegistry() {
        for (const [userId] of this.contexPlayers.entries()) {
            const presence = this.ensurePlayerPresence(userId);
            if (this.isServerControlledUser(userId)) {
                presence.connected = true;
                presence.reconnectDeadlineAt = null;
            }

            if (!this.players.has(userId)) {
                this.players.set(userId, null);
            }
        }
    }

    buildPlayerTeamsMap(players) {
        if (!Array.isArray(players)) {
            throw new Error("BattleSession: snapshot.players must be array");
        }

        const map = new Map();

        for (const player of players) {
            if (!player?.userId) {
                throw new Error("BattleSession: player userId is required");
            }

            if (typeof player.teamId !== "number") {
                throw new Error(`BattleSession: teamId is required for user ${player.userId}`);
            }

            if (map.has(player.userId)) {
                throw new Error(`BattleSession: duplicate userId ${player.userId}`);
            }

            map.set(player.userId, player.teamId);
        }

        return map;
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
        const mode = this.snapshot.mode ?? "PVP";

        return {
            type: "battle_init",
            mode,
            teamId,
            phase: this.phase,
            state: this.state.toClientState(),
            reconnect: {
                sessionToken: presence.sessionToken,
                graceMs: RECONNECT_GRACE_MS
            },
            playersMeta: this.buildPlayersMetaPayload(),
            pve: this.buildPveInitPayload(),
            players: this.getPlayersConnectionState(),
            timeline: this.buildTimelinePayload(),
            deployment: this.buildDeploymentPayload(),
            turn: this.buildTurnPayload()
        };
    }

    buildPlayersMetaPayload() {
        if (!Array.isArray(this.snapshot.players)) {
            return [];
        }

        return this.snapshot.players.map((player) => {
            if (player?.isBot) {
                return {
                    userId: player.userId,
                    teamId: player.teamId,
                    BotType: player.BotType ?? this.snapshot.pve?.enemyPlayer?.BotType ?? player.username ?? null
                };
            }

            return {
                userId: player.userId,
                username: player.username ?? null,
                teamId: player.teamId,
                rating: player.rating ?? null,
                level: player.level ?? null,
                isBot: false
            };
        });
    }

    buildPveInitPayload() {
        return null;
    }

    setPhaseWindow(kind, durationMs) {
        if (!durationMs) {
            this.phaseTimerKind = null;
            this.phaseDeadlineAt = null;
            this.phaseDurationMs = null;
            return;
        }

        this.phaseTimerKind = kind;
        this.phaseDurationMs = durationMs;
        this.phaseDeadlineAt = Date.now() + durationMs;
    }

    clearPhaseWindow() {
        this.phaseTimerKind = null;
        this.phaseDeadlineAt = null;
        this.phaseDurationMs = null;
    }

    getRemainingPhaseTimeMs() {
        if (!this.phaseDeadlineAt) {
            return null;
        }

        return Math.max(0, this.phaseDeadlineAt - Date.now());
    }

    buildTimelinePayload() {
        return {
            phase: this.phase,
            timerKind: this.phaseTimerKind,
            serverNow: Date.now(),
            durationMs: this.phaseDurationMs,
            deadlineAt: this.phaseDeadlineAt,
            remainingMs: this.getRemainingPhaseTimeMs()
        };
    }

    buildDeploymentPayload() {
        if (this.phase !== "DEPLOYMENT") {
            return null;
        }

        return {
            allowedRows: DEPLOYMENT_ALLOWED_ROWS,
            durationMs: this.phaseDurationMs ?? DEPLOYMENT_DURATION_MS,
            deadlineAt: this.phaseDeadlineAt,
            remainingMs: this.getRemainingPhaseTimeMs()
        };
    }

    buildTurnPayload() {
        if (this.phase !== "AWAIT_TURN_ACTIONS") {
            return null;
        }

        const activeUnit = this.state.getActiveUnit();

        return {
            activeUnitId: this.state.activeUnitId,
            activeUnitAp: activeUnit?.ap ?? 0,
            durationMs: this.phaseDurationMs ?? TURN_DURATION_MS,
            deadlineAt: this.phaseDeadlineAt,
            remainingMs: this.getRemainingPhaseTimeMs()
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

    isServerControlledUser(userId) {
        return this.snapshot.players?.some((player) => player?.userId === userId && player?.isBot) ?? false;
    }

    getServerControlledUserIds() {
        return [...this.contexPlayers.keys()].filter((userId) => this.isServerControlledUser(userId));
    }

    getUnitsByOwner(userId) {
        const units = [];

        for (const unit of this.state.units.values()) {
            if (unit.ownerId === userId) {
                units.push(unit);
            }
        }

        return units;
    }

    recordUnitKill(attackerId, targetId) {
        const attacker = this.state.getUnit(Number(attackerId));
        if (!attacker || this.isServerControlledUser(attacker.ownerId)) {
            return;
        }

        const current = this.unitKillCounts.get(attacker.id) || {
            unitId: attacker.id,
            heroId: attacker.heroId,
            instanceId: attacker.instanceId ?? null,
            ownerId: attacker.ownerId,
            kills: 0,
            killedUnitIds: []
        };

        current.kills += 1;
        current.killedUnitIds.push(Number(targetId));
        this.unitKillCounts.set(attacker.id, current);
    }

    buildServerControlledDeployment(userId) {
        const units = this.getUnitsByOwner(userId);
        const result = {};

        for (const unit of units) {
            result[unit.id] = {
                position: [unit.x, unit.y]
            };
        }

        return result;
    }

    queueServerControlledDeployment() {
        if ((this.snapshot.mode ?? "PVP") !== "PVE" || this.phase !== "DEPLOYMENT") {
            return;
        }

        for (const userId of this.getServerControlledUserIds()) {
            if (this.deployment.readyPlayers.has(userId)) {
                continue;
            }

            setTimeout(() => {
                if (this.phase !== "DEPLOYMENT" || this.deployment.readyPlayers.has(userId)) {
                    return;
                }

                this.handleAction({
                    type: "deploy_ready",
                    userId,
                    units: this.buildServerControlledDeployment(userId)
                });
            }, 0);
        }
    }

    findNearestEnemyUnit(unit) {
        let nearestTarget = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const candidate of this.state.units.values()) {
            if (candidate.team === unit.team) {
                continue;
            }

            const distance = Math.abs(unit.x - candidate.x) + Math.abs(unit.y - candidate.y);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestTarget = candidate;
            }
        }

        return nearestTarget;
    }

    getPreferredMovePosition(unit, target) {
        const candidates = [
            { x: unit.x + 1, y: unit.y },
            { x: unit.x - 1, y: unit.y },
            { x: unit.x, y: unit.y + 1 },
            { x: unit.x, y: unit.y - 1 }
        ].sort((left, right) => {
            const leftDistance = Math.abs(left.x - target.x) + Math.abs(left.y - target.y);
            const rightDistance = Math.abs(right.x - target.x) + Math.abs(right.y - target.y);
            return leftDistance - rightDistance;
        });

        for (const candidate of candidates) {
            if (candidate.x === unit.x && candidate.y === unit.y) {
                continue;
            }

            const outOfBounds =
                candidate.x < 0 ||
                candidate.y < 0 ||
                candidate.x >= this.state.terrain.width ||
                candidate.y >= this.state.terrain.height;

            if (outOfBounds) {
                continue;
            }

            const occupied = this.state.getUnitByPosition(candidate.x, candidate.y);
            if (occupied && occupied.id !== unit.id) {
                continue;
            }

            return candidate;
        }

        return null;
    }

    runServerControlledTurn(userId) {
        const attackCost = CombatRules.actionCost("attack");
        let stepsLeft = 16;

        while (stepsLeft > 0 && !this.state.finished) {
            stepsLeft -= 1;

            const activeUnit = this.state.getActiveUnit();
            if (!activeUnit || activeUnit.ownerId !== userId) {
                break;
            }

            const target = this.findNearestEnemyUnit(activeUnit);
            if (!target) {
                break;
            }

            const distance = Math.abs(activeUnit.x - target.x) + Math.abs(activeUnit.y - target.y);

            if (distance <= activeUnit.attackRange) {
                if (activeUnit.ap < attackCost) {
                    break;
                }

                this.handleAction({
                    type: "unit_attack",
                    userId,
                    unitId: activeUnit.id,
                    targetUnitId: target.id
                });
                continue;
            }

            const moveCost = CombatRules.actionCost("move", {
                tiles: 1,
                unitMoveCost: activeUnit.moveCost
            });

            if (activeUnit.ap < moveCost) {
                break;
            }

            const movePosition = this.getPreferredMovePosition(activeUnit, target);
            if (!movePosition) {
                break;
            }

            this.handleAction({
                type: "unit_move",
                userId,
                unitId: activeUnit.id,
                position: movePosition
            });
        }

        if (!this.state.finished) {
            this.handleAction({
                type: "turn_end",
                userId
            });
        }
    }

    queueServerControlledTurn() {
        if ((this.snapshot.mode ?? "PVP") !== "PVE") {
            return;
        }

        const activeUnit = this.state.getActiveUnit();
        if (!activeUnit || !this.isServerControlledUser(activeUnit.ownerId)) {
            return;
        }

        setTimeout(() => {
            this.runServerControlledTurn(activeUnit.ownerId);
        }, 150);
    }

    postEventAutomation(processed) {
        if ((this.snapshot.mode ?? "PVP") !== "PVE") {
            return;
        }

        if (processed.some((event) => event.type === "DEPLOYMENT" || event.type === "deployment_player_ready")) {
            this.queueServerControlledDeployment();
        }

        if (processed.some((event) => event.type === "turn_start")) {
            this.queueServerControlledTurn();
        }
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
            this.setPhaseWindow("turn", TURN_DURATION_MS);

            this.timer = setTimeout(() => {

                this.applyEvents([
                    { type: "turn_end" }
                ]);

            }, TURN_DURATION_MS);
        }

        this.postEventAutomation(processed);
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
        this.clearPhaseWindow();

        log("BATTLE FINISH", {
            winnerTeam: this.state.winnerTeam
        });
        
        const winners = [];
        const losers = [];
        const deadUnitIds = [...new Set(this.pendingBattleEndDeadUnitIds)];

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
            losers,
            ...(deadUnitIds.length > 0 ? { deadUnitIds } : {})
        });

        this.pendingBattleEndDeadUnitIds = [];

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
        if (this.isServerControlledUser(userId)) {
            return;
        }

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
            if (this.isServerControlledUser(winnerId)) continue;

            const reward = rewardsPlan.get(winnerId);
            if (!reward) continue;

            tasks.push(this.rewardClient.applyBattleReward(winnerId, "battle_win", {
                matchId: this.snapshot.matchId,
                winnerTeam: this.state.winnerTeam,
                outcome: "win"
            }, reward));
        }

        for (const loserId of losers) {
            if (this.isServerControlledUser(loserId)) continue;

            const reward = rewardsPlan.get(loserId);
            if (!reward) continue;

            tasks.push(this.rewardClient.applyBattleReward(loserId, "battle_loss", {
                matchId: this.snapshot.matchId,
                winnerTeam: this.state.winnerTeam,
                outcome: "lose"
            }, reward));
        }

        const results = await Promise.allSettled(tasks);
        for (const result of results) {
            if (result.status === "rejected") {
                log("BATTLE REWARD TASK FAILED", {
                    error: result.reason?.message ?? String(result.reason)
                });
            }
        }
    }

    buildRewardsPlan({ winners, losers }) {
        const aliveUnitsByOwner = this.collectAliveUnitsByOwner();
        const allUnitsByOwner = this.collectAllUnitsByOwner();
        const killXpByOwner = this.collectKillXpByOwner();
        const plan = new Map();

        for (const userId of winners) {
            const killXp = killXpByOwner.get(userId) || [];

            plan.set(userId, {
                goldDelta: WINNER_GOLD_REWARD,
                ratingDelta: WINNER_RATING_REWARD,
                victoriesDelta: 1,
                defeatsDelta: 0,
                killXp,
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
                killXp: killXpByOwner.get(userId) || [],
                removedHeroes: deadUnits.map(unit => ({
                    heroId: unit.heroId,
                    instanceId: unit.instanceId
                }))
            });
        }

        return plan;
    }

    collectKillXpByOwner() {
        const result = new Map();

        for (const killData of this.unitKillCounts.values()) {
            if (!killData.ownerId || killData.kills <= 0) {
                continue;
            }

            if (!result.has(killData.ownerId)) {
                result.set(killData.ownerId, []);
            }

            result.get(killData.ownerId).push({
                heroId: killData.heroId,
                instanceId: killData.instanceId,
                unitId: killData.unitId,
                kills: killData.kills,
                killedUnitIds: [...killData.killedUnitIds],
                xpDelta: killData.kills * XP_PER_KILL
            });
        }

        return result;
    }

    collectAliveUnitsByOwner() {
        const result = new Map();

        for (const unit of this.state.units.values()) {
            const ownerId = unit.ownerId;
            if (!ownerId) continue;

            const item = {
                heroId: unit.heroId,
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
