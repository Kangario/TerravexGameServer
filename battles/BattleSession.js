// battles/BattleSession.js

import { BattleState } from "./BattlePhase/BattleState.js";
import { TurnProcessor } from "./TurnController/TurnProcessor.js";

export class BattleSession {

    constructor(snapshot) {
        this.snapshot = snapshot;
        this.state = new BattleState({ snapshot });

        this.phase = "INIT";
        this.players = new Map(); // userId -> ws

        this.finishedCallback = null;
        
        this.startBattle();
    }

    // =========================
    // LIFECYCLE
    // =========================
    startBattle() {
        this.advanceToTurnStart();
    }

    finishBattle() {
        this.phase = "BATTLE_END";

        this.broadcast({
            type: "battle_end",
            winnerTeam: this.state.winnerTeam
        });

        if (this.finishedCallback) {
            this.finishedCallback();
        }
    }
    
    onFinished(callback) {
        this.finishedCallback = callback;
    }

    // =========================
    // PLAYERS
    // =========================
    addPlayer(userId, ws) {
        this.players.set(userId, ws);

        // при подключении всегда шлём актуальный state
        ws.send(JSON.stringify({
            type: "state",
            state: this.state.toClientState()
        }));
    }

    reconnectPlayer(ws, userId) {
        this.players.set(userId, ws);
        ws.send(JSON.stringify({
            type: "state",
            state: this.state.toClientState()
        }));
    }

    disconnectPlayer(userId) {
        this.players.delete(userId);
    }

    broadcast(payload) {
        const msg = JSON.stringify(payload);
        this.players.forEach(ws => ws.send(msg));
    }

    // =========================
    // TURN FLOW
    // =========================
    advanceToTurnStart() {
        if (this.state.finished) {
            this.finishBattle();
            return;
        }

        this.phase = "TURN_START";
        this.state.startTurn();

        this.broadcast({
            type: "turn_start",
            unitId: this.state.activeUnitId,
            ap: this.state.getActiveUnit().ap
        });

        this.phase = "AWAIT_TURN_ACTIONS";
    }

    // =========================
    // CLIENT INPUT
    // =========================
    handleTurnActions(userId, msg) {
        if (this.phase !== "AWAIT_TURN_ACTIONS") {
            return this.reject(userId, "Not accepting actions now");
        }

        const activeUnit = this.state.getActiveUnit();

        // ❗ сервер решает, кто ходит
        if (msg.unitId !== activeUnit.id) {
            return this.reject(userId, "Not your unit's turn");
        }

        this.phase = "RESOLVE_TURN";

        const result = TurnProcessor.process({
            state: this.state,
            actions: msg.actions
        });

        // рассылаем результат
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
        const ws = this.players.get(userId);
        if (!ws) return;

        ws.send(JSON.stringify({
            type: "error",
            message: reason
        }));
    }
}
