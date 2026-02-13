import { BaseBattleAction } from "../BaseBattleAction.js";

export class AttackAction extends BaseBattleAction {

    validate(session, action) {

        if (session.state.activeUnitId !== action.unitId) {
            throw new Error("Not active unit");
        }
        
        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
    }

    execute({ session, action, eventLog }) {

        eventLog.push({
            type: "unit_attack",
            unitId: action.unitId,
            target: action.targetUnitId
        });
    }
}
