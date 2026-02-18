import { BaseBattleAction } from "../BaseBattleAction.js";

export class MoveAction extends BaseBattleAction {

    validate(session, action) {

        if (session.phase === "TURN_START"){
        if (session.state.activeUnitId !== action.unitId) {
            throw new Error("Not active unit");
        }
        }
        
        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
    }

    execute({ session, action, eventLog }) {

        eventLog.push({
            type: "unit_move",
            unitId: action.unitId,
            position: [
                action.position.x,
                action.position.y]
        });
    }
}
