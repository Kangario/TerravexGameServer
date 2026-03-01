import { BaseBattleAction } from "../BaseBattleAction.js";

export class TurnEndAction extends BaseBattleAction {

    validate(session, action) {

        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
        const activeUnit = session.state.getActiveUnit();

        if (!activeUnit) {
            throw new Error("Active unit not found");
        }

        if (activeUnit.ownerId !== action.userId) {
            throw new Error("Only active unit owner can end turn");
        }
    }

    execute({ session, action, eventLog }) {

        eventLog.push({
            type: "turn_end",
            userId: action.userId
        });
    }
}
