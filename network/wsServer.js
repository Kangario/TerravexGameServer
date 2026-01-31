import { WebSocketServer } from "ws";
import { messageRouter } from "./messageRouter.js";

export function initWSServer(server) {
    console.log("🟢 Init WS Server");
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
        console.log("🟢 Client connected");

        ws.on("message", (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                console.error("❌ Invalid JSON");
                return;
            }

            messageRouter.handle(ws, msg);
        });

        ws.on("close", () => {
            console.log("🔴 Client disconnected");
            messageRouter.handleClose(ws);
        });
    });
}
