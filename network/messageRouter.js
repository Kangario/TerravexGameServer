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

                case "join":
                    log("➡️ ROUTE → BattleManager.handleJoin");
                    await BattleManager.handleJoin(ws, msg);
                    log("✅ JOIN handled");
                    break;

                case "turn_actions":
                    log("➡️ ROUTE → BattleManager.handleTurnActions");
                    BattleManager.handleTurnActions(ws, msg);
                    log("✅ TURN ACTIONS handled");
                    break;

                case "reconnect":
                    log("➡️ ROUTE → BattleManager.handleReconnect");
                    BattleManager.handleReconnect(ws, msg);
                    log("✅ RECONNECT handled");
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
            log("✅ DISCONNECT handled");
        } catch (err) {
            console.error("🔥 DISCONNECT ERROR:", err);
        }
    }
};
