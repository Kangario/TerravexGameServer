import http from "http";
import { WebSocketServer } from "ws";
import { initRedis } from "./config/redis.js";
import { initWSServer } from "./network/wsServer.js";

await initRedis();

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
    }

    res.writeHead(200);
    res.end("BattleServer is running");
});

initWSServer(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🟢 Battle WebSocket Server running on port ${PORT}`);
});
