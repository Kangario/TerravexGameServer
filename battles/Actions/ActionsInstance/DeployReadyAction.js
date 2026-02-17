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
            units: action.units
        });
        console.log(session.players.size)
        console.log(session.deployment.readyPlayers.size)
        if (session.deployment.readyPlayers.size === session.players.size) {

            eventLog.push({
                type: "deployment_end"
            });

            session.phase = "TURN_START";
        }
    }
}
