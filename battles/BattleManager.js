import { loadBattleSnapshot } from "./LoadBattleSnapshot.js";
import { BattleFactory } from "./BattleFactory.js";

const activeBattles = new Map(); // matchId -> Battle

function log(...args) {
    console.log("[BattleManager]", ...args);
}

function logErr(...args) {
    console.error("[BattleManager][ERROR]", ...args);
}

export const BattleManager = {

    async getOrCreateBattle(matchId) {
        log("getOrCreateBattle:", matchId);

        let battle = activeBattles.get(matchId);
        if (battle) {
            log("Battle exists in memory:", matchId);
            return battle;
        }

        try {
            log("Loading snapshot:", matchId);
            const snapshot = await loadBattleSnapshot(matchId);
            log("Snapshot loaded:", matchId);
            
            battle.onFinished(() => {
                log("Battle finished → removing:", matchId);
                activeBattles.delete(matchId);
            });

            activeBattles.set(matchId, battle);
            log("Battle stored in activeBattles:", matchId);

            return battle;

        } catch (err) {
            logErr("getOrCreateBattle failed:", matchId, err);
            throw err;
        }
    },

    getBattle(ws) {
        if (!ws.matchId) {
            logErr("getBattle: socket not bound");
            throw new Error("Socket not bound");
        }

        const battle = activeBattles.get(ws.matchId);
        if (!battle) {
            logErr("Battle not found for matchId:", ws.matchId);
        }

        return battle;
    },

    bindSocket(ws, { matchId, userId }) {
        ws.matchId = matchId;
        ws.userId = userId;
        log("Socket bound:", { matchId, userId });
    },

    async handleJoin(ws, msg) {
        log("handleJoin:", msg);

        try {
            const battle = await this.getOrCreateBattle(msg.matchId);

            battle.addPlayer(msg.userId, ws);
            log("Player added:", msg.userId, "→", msg.matchId);

            this.bindSocket(ws, msg);

        } catch (err) {
            logErr("handleJoin failed:", err);
        }
    },

    handleTurnActions(ws, msg) {
        log("handleTurnActions:", ws.userId);

        try {
            const battle = this.getBattle(ws);
            battle.handleTurnActions(ws.userId, msg);
        } catch (err) {
            logErr("handleTurnActions failed:", err);
        }
    },

    handleReconnect(ws, msg) {
        log("handleReconnect:", msg);

        const battle = activeBattles.get(msg.matchId);
        if (!battle) {
            log("Reconnect failed — battle not found:", msg.matchId);
            return;
        }

        battle.reconnectPlayer(ws, msg.userId);
        this.bindSocket(ws, msg);
        log("Player reconnected:", msg.userId);
    },

    handleDisconnect(ws) {
        if (!ws.matchId) {
            log("Disconnect: socket had no matchId");
            return;
        }

        const battle = activeBattles.get(ws.matchId);
        if (!battle) {
            log("Disconnect: battle already gone:", ws.matchId);
            return;
        }

        battle.disconnectPlayer(ws.userId);
        log("Player disconnected:", ws.userId, "from", ws.matchId);
    }
};
