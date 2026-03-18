import { loadBattleSnapshot } from "./LoadBattleSnapshot.js";
import { BattleSession } from "./BattleSession.js";
import { gsRedis, mmRedis } from "../config/redis.js";

const activeBattles = new Map(); // matchId -> Battle
const MM_MATCH_KEY_PREFIX = process.env.MM_MATCH_KEY_PREFIX || "mm:match:";
const GS_QUEUE_MATCHES_KEY = process.env.GS_QUEUE_MATCHES_KEY || "gs:queue:matches";
const GS_MATCH_KEY_PREFIX = "gs:match:";

function log(...args) {
    console.log("[BattleManager]", ...args);
}

function logErr(...args) {
    console.error("[BattleManager][ERROR]", ...args);
}

async function removeBattleFromRedis(matchId) {
    if (!matchId) {
        return;
    }

    const gsKey = `gs:match:${matchId}`;
    const mmKey = `${MM_MATCH_KEY_PREFIX}${matchId}`;
    const queueMembers = [matchId, gsKey, mmKey];
    const queueType = await gsRedis.type(GS_QUEUE_MATCHES_KEY);
    const cleanupTasks = [
        gsRedis.del(gsKey),
        mmRedis.del(mmKey)
    ];

    if (queueType === "zset") {
        cleanupTasks.push(gsRedis.zRem(GS_QUEUE_MATCHES_KEY, queueMembers));
    } else if (queueType === "set") {
        cleanupTasks.push(gsRedis.sRem(GS_QUEUE_MATCHES_KEY, queueMembers));
    } else if (queueType === "hash") {
        cleanupTasks.push(gsRedis.hDel(GS_QUEUE_MATCHES_KEY, queueMembers));
    }

    await Promise.allSettled(cleanupTasks);

    log("🧹 Removed battle records", {
        matchId,
        gsKey,
        mmKey,
        queueKey: GS_QUEUE_MATCHES_KEY,
        queueType
    });
}

function normalizeMatchId(matchId) {
    if (!matchId) {
        return matchId;
    }

    if (matchId.startsWith(MM_MATCH_KEY_PREFIX)) {
        return matchId.slice(MM_MATCH_KEY_PREFIX.length);
    }

    if (matchId.startsWith(GS_MATCH_KEY_PREFIX)) {
        return matchId.slice(GS_MATCH_KEY_PREFIX.length);
    }

    return matchId;
}

export const BattleManager = {

    async getOrCreateBattle(matchId) {
        const normalizedMatchId = normalizeMatchId(matchId);

        let battle = activeBattles.get(normalizedMatchId);

        if (battle) return battle;

        const snapshot = await loadBattleSnapshot(normalizedMatchId);

        battle = await BattleSession.create(snapshot);

        battle.onFinished(async () => {
            activeBattles.delete(normalizedMatchId);
            await removeBattleFromRedis(normalizedMatchId);
        });


        activeBattles.set(normalizedMatchId, battle);

        return battle;
    },

    getBattle(ws) {

        if (!ws.matchId) {
            throw new Error("Socket not bound");
        }

        return activeBattles.get(ws.matchId);
    },

    bindSocket(ws, { matchId, userId, sessionToken }) {
        const normalizedMatchId = normalizeMatchId(matchId);

        ws.matchId = normalizedMatchId;
        ws.userId = userId;
        ws.sessionToken = sessionToken ?? ws.sessionToken ?? null;
    },

    async handleJoin(ws, msg) {

        const normalizedMatchId = normalizeMatchId(msg.matchId);
        const battle = await this.getOrCreateBattle(normalizedMatchId);

        battle.addPlayer(msg.userId, ws);

        this.bindSocket(ws, {
            ...msg,
            matchId: normalizedMatchId,
            sessionToken: battle.ensurePlayerPresence(msg.userId).sessionToken
        });

        battle.startBattle();
    },

   
    handleAction(ws, action) {

        try {

            const battle = this.getBattle(ws);
            if (!battle) {
                throw new Error("Battle is already finished");
            }
            battle.handleAction({
                ...action.action,
                userId: ws.userId
            });

        } catch (err) {

            logErr("handleAction failed:", err);

            if (ws && typeof ws.send === "function") {
                ws.send(JSON.stringify({
                    type: "error",
                    message: err.message
                }));
            }
        }
    },

    async handleReconnect(ws, msg) {
        const normalizedMatchId = normalizeMatchId(msg.matchId);

        let battle;

        try {
            battle = await this.getOrCreateBattle(normalizedMatchId);
        } catch (err) {
            battle = null;
        }

        if (!battle) {
            if (typeof ws.send === "function") {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Battle not found for reconnect"
                }));
            }
            return;
        }

        const reconnected = battle.reconnectPlayer(ws, msg.userId, msg.sessionToken);

        if (!reconnected) {
            return;
        }

        this.bindSocket(ws, {
            ...msg,
            matchId: normalizedMatchId
        });
    },

    handleDisconnect(ws) {

        if (!ws.matchId) return;

        const battle = activeBattles.get(ws.matchId);

        if (!battle) return;

        battle.disconnectPlayer(ws.userId, ws);
    }
    
    

};
