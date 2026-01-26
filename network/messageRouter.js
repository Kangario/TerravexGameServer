import { BattleManager } from "../battles/BattleManager.js";

export const messageRouter = {
    async handle(ws, msg) {
        switch (msg.type) {

            case "join":
                await BattleManager.handleJoin(ws, msg);
                break;

            case "player_action":
                BattleManager.handleAction(ws, msg);
                break;

            case "reconnect":
                BattleManager.handleReconnect(ws, msg);
                break;

            default:
                console.warn("⚠️ Unknown message type:", msg.type);
        }
    },

    handleClose(ws) {
        BattleManager.handleDisconnect(ws);
    }
};
