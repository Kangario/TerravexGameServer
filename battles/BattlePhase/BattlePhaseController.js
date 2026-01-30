import { EBattlePhase } from "./BattlePhase.js";

export class BattlePhaseController {

    constructor(battle) {
        this.battle = battle;
    }

    setPhase(newPhase, patch = {}) {
        const state = this.battle.state;

        if (state.CurrentPhase === newPhase)
            return;

        state.CurrentPhase = newPhase;
        this.battle.battleVersion++;

        this.battle.broadcast({
            type: "phase_changed",
            battleVersion: this.battle.battleVersion,
            eventIndex: this.battle.eventIndex,
            phase: newPhase,
            statePatch: {
                CurrentPhase: newPhase,
                ...patch
            }
        });

        console.log("🔁 Phase →", newPhase);
    }
}
