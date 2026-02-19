import { BaseBattleAction } from "../BaseBattleAction.js";

export class AttackAction extends BaseBattleAction {

    validate(session, action) {
        const unitId = Number(action.unitId);
        
        if (session.state.activeUnitId !== unitId) {
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
