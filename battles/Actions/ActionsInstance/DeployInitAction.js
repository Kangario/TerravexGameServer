import { BaseBattleAction } from "../BaseBattleAction.js";

const duration = 45000;
const allowedRows= [[0,1], [38,39]]

export class DeployInitAction extends BaseBattleAction {
    
    validate(session, action) {
        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }
    }

    execute({ session, action, eventLog }) {
        
       eventLog.push({
           type: "DEPLOYMENT",
           duration,
           allowedRows
           });
    }
}
