import { BaseBattleAction } from "../BaseBattleAction.js";

export class DeployReadyAction extends BaseBattleAction {

    validate(session, action) {

        if (session.phase !== "DEPLOYMENT") {
            throw new Error("Not deployment phase");
        }

        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
    }

    execute({ session, action, eventLog }) {
        
        console.log(action);
        
        eventLog.push({
            type: "deployment_player_ready",
            userId: action.userId,
        });
    }
}
