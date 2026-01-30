import { EBattlePhase } from "./BattlePhase.js";

export class TurnController {

    constructor(battle) {
        this.battle = battle;
    }

    beginTurn() {
        const state = this.battle.state;
        const unit = state.getCurrentUnit();

        if (!unit || unit.IsDead) {
            this.advanceTurn();
            return;
        }

        unit.AP = unit.MaxAP;

        this.battle.phase.setPhase(EBattlePhase.TurnStart, {
            CurrentUnitId: unit.UnitId
        });

        this.battle.phase.setPhase(EBattlePhase.PlayerPlanning);
    }

    endTurn() {
        this.battle.phase.setPhase(EBattlePhase.TurnEnd);
        this.advanceTurn();
    }

    advanceTurn() {
        const state = this.battle.state;

        state.TurnIndex++;
        const idx = state.TurnIndex % state.InitiativeOrder.length;
        state.CurrentUnitId = state.InitiativeOrder[idx];
        state.TurnNumber++;

        this.beginTurn();
    }
}
