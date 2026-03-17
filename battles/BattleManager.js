import { loadBattleSnapshot } from "./LoadBattleSnapshot.js";
import { BattleSession } from "./BattleSession.js";
import { gsRedis, mmRedis } from "../config/redis.js";

const activeBattles = new Map(); // matchId -> Battle
const MM_MATCH_KEY_PREFIX = process.env.MM_MATCH_KEY_PREFIX || "mm:match:";
const GS_QUEUE_MATCHES_KEY = process.env.GS_QUEUE_MATCHES_KEY || "gs:queue:matches";

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

export const BattleManager = {

    async getOrCreateBattle(matchId) {

        let battle = activeBattles.get(matchId);

        if (battle) return battle;

        const snapshot = await loadBattleSnapshot(matchId);

        battle = await BattleSession.create(snapshot);

        battle.onFinished(async () => {
            activeBattles.delete(matchId);
            await removeBattleFromRedis(matchId);
        });


        activeBattles.set(matchId, battle);

        return battle;
    },

    getBattle(ws) {

        if (!ws.matchId) {
            throw new Error("Socket not bound");
        }

        return activeBattles.get(ws.matchId);
    },

    bindSocket(ws, { matchId, userId }) {

        ws.matchId = matchId;
        ws.userId = userId;
    },

    async handleJoin(ws, msg) {

        const battle = await this.getOrCreateBattle(msg.matchId);

        battle.addPlayer(msg.userId, ws);

        this.bindSocket(ws, msg);

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

    handleReconnect(ws, msg) {

        const battle = activeBattles.get(msg.matchId);

        if (!battle) return;

        battle.reconnectPlayer(ws, msg.userId);

        this.bindSocket(ws, msg);
    },

    handleDisconnect(ws) {

        if (!ws.matchId) return;

        const battle = activeBattles.get(ws.matchId);

        if (!battle) return;

        battle.disconnectPlayer(ws.userId);
    }
    
    

};
