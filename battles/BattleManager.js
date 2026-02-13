import { loadBattleSnapshot } from "./LoadBattleSnapshot.js";
import {BattleSession} from "./BattleSession.js";

const activeBattles = new Map(); // matchId -> Battle

function log(...args) {
    console.log("[BattleManager]", ...args);
}

function logErr(...args) {
    console.error("[BattleManager][ERROR]", ...args);
}

export const BattleManager = {

    async getOrCreateBattle(matchId) {

        let battle = activeBattles.get(matchId);

        if (battle) return battle;

        const snapshot = await loadBattleSnapshot(matchId);

        battle = await BattleSession.create(snapshot);

        battle.onFinished(() => {
            activeBattles.delete(matchId);
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

            battle.handleAction({
                ...action.action,
                userId: ws.userId
            });

        } catch (err) {

            logErr("handleAction failed:", err);
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
