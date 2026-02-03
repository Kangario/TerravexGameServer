import { BattleState } from "./BattlePhase/BattleState.js";
import { TurnProcessor } from "./TurnController/TurnProcessor.js";

function log(stage, data = {}) {
    console.log(
        `[BattleSession][${new Date().toISOString()}] ${stage}`,
        data
    );
}

export class BattleSession {

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
        this.matchPlayers = snapshot.players;
        
        this.phase = "INIT";
        this.players = new Map(); // userId -> ws
        this.finishedCallback = null;

        this.deployment = {
            readyPlayers: new Set(),
            startedAt: null,
            timer: null
        };
        
        log("CONSTRUCTOR END", {
            matchId: snapshot.matchId,
            initialPhase: this.phase
        });
        
    }
    
    getTeamIdForUser(userId) {
        const player = this.matchPlayers.find(p => p.userId === userId);
        return player?.teamId;
    }
    // =========================
    // LIFECYCLE
    // =========================
    startBattle() {
        log("BATTLE START");
        this.startDeployment();
    }

    startDeployment() {
        this.phase = "DEPLOYMENT";
        this.deployment.startedAt = Date.now();
        this.deployment.readyPlayers.clear();

        this.broadcast({
            type: "deployment_start",
            duration: 15000,
            allowedRows: {
                team1: [0, 1],
                team2: [13, 14]
            }
        });

        this.deployment.timer = setTimeout(() => {
            this.finishDeployment();
        }, 15000);
    }

    handleDeploymentReady(userId) {
        if (this.phase !== "DEPLOYMENT") return;

        this.deployment.readyPlayers.add(userId);

        this.broadcast({
            type: "deployment_player_ready",
            userId
        });

        if (this.deployment.readyPlayers.size === this.players.size) {
            this.finishDeployment();
        }
    }

    finishDeployment() {
        if (this.phase !== "DEPLOYMENT") return;

        clearTimeout(this.deployment.timer);

        this.phase = "TURN_START";

        this.broadcast({
            type: "deployment_end"
        });

        this.advanceToTurnStart();
    }

    finishBattle() {
        this.phase = "BATTLE_END";

        log("BATTLE FINISH", {
            winnerTeam: this.state.winnerTeam
        });

        this.broadcast({
            type: "battle_end",
            winnerTeam: this.state.winnerTeam
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
        
        ws.send(JSON.stringify({
            type: "battle_init",
            state: this.state.toClientState()
        }));
    }

    reconnectPlayer(ws, userId) {
        this.players.set(userId, ws);

        log("PLAYER RECONNECTED", {
            userId,
            totalPlayers: this.players.size
        });
        ws.send(JSON.stringify({
            type: "battle_init",
            state: this.state.toClientState()
        }));
    }

    disconnectPlayer(userId) {
        this.players.delete(userId);
        log("PLAYER DISCONNECTED", {
            userId,
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

    // =========================
    // TURN FLOW
    // =========================
    advanceToTurnStart() {
        if (this.state.finished) {
            log("ADVANCE TURN → BATTLE FINISHED");
            this.finishBattle();
            return;
        }

        this.phase = "TURN_START";

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
