import { BaseBattleAction } from "../BaseBattleAction.js";

export class TurnEndAction extends BaseBattleAction {

    validate(session, action) {

        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
    }

    execute({ session, action, eventLog }) {

        eventLog.push({
            type: "turn_end",
            userId: action.userId
        });
    }
}
