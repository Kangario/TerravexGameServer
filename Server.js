import WebSocket, { WebSocketServer } from "ws";
import { createServer } from "http";
import { createClient } from "redis";

/* ================= REDIS ================= */

const gsRedis = createClient({
    username: 'default',
    password: 'o0EjuPkv0vCmo25LodqPxQMBvKDjzMpD',
    socket: {
        host: 'redis-16597.c328.europe-west3-1.gce.cloud.redislabs.com',
        port: 16597
    }
});

const mmRedis = createClient({
    username: "default",
    password: "67zcdHUvuYYp23FZ4vDSDmQKJIyelSNf",
    socket: {
        host: "redis-16482.c328.europe-west3-1.gce.cloud.redislabs.com",
        port: 16482,
    },
});

mmRedis.on("error", (err) => console.error("MM Redis error:", err));
gsRedis.on("error", (err) => console.error("GS Redis error:", err));

await gsRedis.connect();
await mmRedis.connect();

console.log("✅ Connected to GameServer Redis");
console.log("✅ Connected to Matchmaking Redis");

/* ================= HTTP + WEBSOCKET ================= */

const server = createServer();
const wss = new WebSocketServer({ server });

/* ================= ACTIVE MATCHES ================= */

// In-memory хранилище активных матчей
// matchId -> { players: Map<userId, socket> }
const activeMatches = new Map();

/* ================= CONNECTION HANDLER ================= */

wss.on("connection", (ws, req) => {
    console.log("🟢 Client connected");

    ws.on("message", async (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (e) {
            console.error("❌ Invalid JSON:", data.toString());
            return;
        }

        console.log("📩 Received:", msg);

        switch (msg.type) {

            /* ===== JOIN MATCH ===== */
            case "join":
                await handleJoin(ws, msg);
                break;

            /* ===== RESUME (на будущее) ===== */
            case "resume":
                await handleResume(ws, msg);
                break;

            default:
                console.warn("⚠️ Unknown message type:", msg.type);
        }
    });

    ws.on("close", () => {
        console.log("🔴 Client disconnected");
        cleanupSocket(ws);
    });
});

/* ================= JOIN HANDLER ================= */

async function handleJoin(ws, msg) {
    const { matchId, userId } = msg;

    if (!matchId || !userId) {
        ws.send(JSON.stringify({
            type: "error",
            message: "matchId or userId missing"
        }));
        return;
    }

    console.log(`🧩 Join request: match=${matchId} user=${userId}`);

    // Проверим, что матч существует в matchmaking redis
    const matchKey = `mm:match:${matchId.split(":").pop()}`;
    const matchData = await mmRedis.get(matchKey);

    if (!matchData) {
        ws.send(JSON.stringify({
            type: "error",
            message: "match not found"
        }));
        return;
    }

    const match = JSON.parse(matchData);

    console.log("📦 Match loaded from Redis:", match.id);

    // Регистрируем матч в памяти
    if (!activeMatches.has(match.id)) {
        activeMatches.set(match.id, {
            players: new Map()
        });
    }

    const matchState = activeMatches.get(match.id);
    matchState.players.set(userId, ws);

    // Привязываем socket к контексту
    ws.matchId = match.id;
    ws.userId = userId;

    console.log(`✅ Player ${userId} joined match ${match.id}`);

    // Если оба игрока подключились — стартуем бой
    if (matchState.players.size === 2) {
        console.log("🔥 Both players connected, sending battle_init");

        startBattle(match.id, matchState);
    }
}

/* ================= START BATTLE ================= */

function startBattle(matchId, matchState) {

    // 🔹 ТЕСТОВЫЙ battle_init (ПОКА ЗАГЛУШКА)
    const battleInit = {
        type: "battle_init",
        width: 10,
        height: 10,
        terrain: {
            heights: Array(100).fill(1),
            types: Array(100).fill(0)
        },
        players: Array.from(matchState.players.keys()).map((id, index) => ({
            id,
            team: index + 1
        })),
        units: [
            { id: 1, x: 2, y: 2, team: 1, hp: 100 },
            { id: 2, x: 7, y: 7, team: 2, hp: 100 }
        ]
    };

    // Рассылаем ОБОИМ игрокам
    for (const [userId, socket] of matchState.players.entries()) {
        socket.send(JSON.stringify(battleInit));
    }

    console.log("🚀 battle_init sent to players of", matchId);
}

/* ================= RESUME (НА БУДУЩЕ) ================= */

async function handleResume(ws, msg) {
    const { matchId, userId } = msg;

    console.log(`🔁 Resume request: match=${matchId} user=${userId}`);

    // Тут потом можно восстановить state из gsRedis
}

/* ================= CLEANUP ================= */

function cleanupSocket(ws) {
    if (!ws.matchId || !ws.userId) return;

    const matchState = activeMatches.get(ws.matchId);
    if (!matchState) return;

    matchState.players.delete(ws.userId);

    console.log(`🧹 Removed player ${ws.userId} from match ${ws.matchId}`);
}

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🟢 Battle WebSocket Server running on port ${PORT}`);
});