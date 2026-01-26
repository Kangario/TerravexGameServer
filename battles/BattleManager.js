import { gsRedis } from "../config/redis.js";
import { BattleFactory } from "./BattleFactory.js";

const activeBattles = new Map(); // matchId -> Battle

export const BattleManager = {

    async handleJoin(ws, msg) {
        const { matchId, userId } = msg;

        const matchKey = `gs:match:${matchId}`;
        const matchData = await gsRedis.get(matchKey);

        if (!matchData) {
            ws.send(JSON.stringify({ type: "error", message: "match not found" }));
            return;
        }

        const match = JSON.parse(matchData);

        let battle = activeBattles.get(match.id);

        if (!battle) {
            battle = BattleFactory.create(match);
            activeBattles.set(match.id, battle);
        }

        battle.addPlayer(userId, ws);

        ws.matchId = match.id;
        ws.userId = userId;
    },

    handleAction(ws, msg) {
        const battle = activeBattles.get(ws.matchId);
        if (!battle) return;

        battle.handleAction(ws.userId, msg);
    },

    handleReconnect(ws, msg) {
        const battle = activeBattles.get(msg.matchId);
        if (!battle) return;

        battle.handleReconnect(ws, msg.userId, msg.battleVersion);
    },

    handleDisconnect(ws) {
        const battle = activeBattles.get(ws.matchId);
        if (!battle) return;

        battle.handleDisconnect(ws.userId);
    }
};
