const activeBattles = new Map(); // matchId -> Battle

export const BattleManager = {
   
    async getOrCreateBattle(matchId) {
        let battle = activeBattles.get(matchId);
        if (battle) return battle;

        const snapshot = await loadBattleSnapshot(matchId);
        battle = BattleFactory.create(matchId, snapshot);

        battle.onFinished(() => {
            activeBattles.delete(matchId);
        });

        activeBattles.set(matchId, battle);
        return battle;
    },

    getBattle(ws) {
        if (!ws.matchId) throw new Error("Socket not bound");
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
    },

    handleTurnActions(ws, msg) {
        const battle = this.getBattle(ws);
        battle.handleTurnActions(ws.userId, msg);
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
