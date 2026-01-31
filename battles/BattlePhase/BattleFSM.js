// battles/fsm/BattleFSM.js

export const BattlePhase = Object.freeze({
    INIT: "INIT",
    TURN_START: "TURN_START",
    AWAIT_TURN_ACTIONS: "AWAIT_TURN_ACTIONS",
    RESOLVE_TURN: "RESOLVE_TURN",
    BATTLE_END: "BATTLE_END"
});

export class BattleFSM {

    constructor() {
        this.phase = BattlePhase.INIT;
    }

    // =========================
    // QUERY
    // =========================
    is(phase) {
        return this.phase === phase;
    }

    canAcceptTurnActions() {
        return this.phase === BattlePhase.AWAIT_TURN_ACTIONS;
    }

    // =========================
    // TRANSITIONS
    // =========================
    startBattle() {
        this._transition(BattlePhase.TURN_START);
    }

    startTurn() {
        this._transition(BattlePhase.AWAIT_TURN_ACTIONS);
    }

    resolveTurn() {
        this._transition(BattlePhase.RESOLVE_TURN);
    }

    endBattle() {
        this._transition(BattlePhase.BATTLE_END);
    }

    // =========================
    // INTERNAL
    // =========================
    _transition(nextPhase) {
        if (!this._isValidTransition(this.phase, nextPhase)) {
            throw new Error(
                `Invalid FSM transition: ${this.phase} → ${nextPhase}`
            );
        }
        this.phase = nextPhase;
    }

    _isValidTransition(from, to) {
        const allowed = {
            INIT: [BattlePhase.TURN_START],
            TURN_START: [BattlePhase.AWAIT_TURN_ACTIONS],
            AWAIT_TURN_ACTIONS: [BattlePhase.RESOLVE_TURN],
            RESOLVE_TURN: [BattlePhase.TURN_START, BattlePhase.BATTLE_END],
            BATTLE_END: []
        };
        return allowed[from]?.includes(to);
    }
}
