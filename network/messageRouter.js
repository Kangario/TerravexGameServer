import { BattleManager } from "../battles/BattleManager.js";

function log(prefix, ...args) {
    console.log(`[${new Date().toISOString()}] ${prefix}`, ...args);
}

export const messageRouter = {

    async handle(ws, msg) {

        const clientId = ws.userId || ws.id || "unknown";

        log("📨 INCOMING MESSAGE", {
            client: clientId,
            type: msg?.type,
            payload: msg
        });

        try {

            switch (msg.type) {

                // ======================
                // SYSTEM MESSAGES
                // ======================

                case "join":

                    log("➡️ ROUTE → BattleManager.handleJoin");

                    await BattleManager.handleJoin(ws, msg);

                    break;


                case "reconnect":

                    log("➡️ ROUTE → BattleManager.handleReconnect");

                    await BattleManager.handleReconnect(ws, msg);

                    break;


                // ======================
                // GAMEPLAY ACTIONS
                // ======================

                case "action":

                    log("➡️ ROUTE → BattleManager.handleAction");

                    BattleManager.handleAction(ws, msg);

                    break;


                default:

                    log("⚠️ UNKNOWN MESSAGE TYPE", msg.type);

            }

        } catch (err) {

            console.error("🔥 ROUTER ERROR:", {
                client: clientId,
                type: msg?.type,
                error: err.stack || err
            });

        }
    },


    handleClose(ws) {

        const clientId = ws.userId || ws.id || "unknown";

        log("❌ SOCKET CLOSED", clientId);

        try {

            BattleManager.handleDisconnect(ws);

        } catch (err) {

            console.error("🔥 DISCONNECT ERROR:", err);

        }
    }

};
