import { EBattlePhase } from "./BattlePhase.js";

export class BattleValidator {

    static canAct(battle, userId, unitId) {

        const state = battle.state;

        if (state.CurrentPhase !== EBattlePhase.PlayerPlanning)
            return "Wrong phase";

        const unit = state.Units[unitId];
        if (!unit || unit.IsDead)
            return "Invalid unit";

        if (state.CurrentUnitId !== unitId)
            return "Not your turn";

        if (unit.PlayerId !== userId)
            return "Not owner";

        return null;
    }
}
