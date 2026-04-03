import http from "http";
import { initRedis } from "./config/redis.js";
import { initWSServer } from "./network/wsServer.js";

let startupState = "starting";
let startupError = null;
const STARTUP_TIMEOUT_MS = Number(process.env.STARTUP_TIMEOUT_MS || 10000);

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", startupState }));
        return;
    }

    if (req.url === "/ready") {
        const isReady = startupState === "ready";
        res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: isReady ? "ready" : "starting",
            startupState,
            error: startupError
        }));
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

void (async () => {
    try {
        await Promise.race([
            initRedis(),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Startup timed out after ${STARTUP_TIMEOUT_MS}ms`)), STARTUP_TIMEOUT_MS);
            })
        ]);
        startupState = "ready";
        console.log("✅ Startup completed");
    } catch (error) {
        startupState = "degraded";
        startupError = error instanceof Error ? error.message : String(error);
        console.error("❌ Startup dependency initialization failed:", error);
    }
})();
