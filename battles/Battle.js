export class Battle {

    constructor(match) {
        this.matchId = match.id;
        this.players = new Map(); // userId -> ws

        this.battleVersion = 0;
        this.eventIndex = 0;

        this.state = this.createInitialState(match);
    }

    addPlayer(userId, ws) {
        this.players.set(userId, ws);

        if (this.players.size === 2) {
            this.start();
        }
    }

    start() {
        const battleInit = {
            type: "battle_init",
            battleVersion: this.battleVersion,
            state: this.state
        };

        this.broadcast(battleInit);
        console.log("🚀 Battle started:", this.matchId);
    }

    handleAction(userId, msg) {
        // ПОКА ЗАГЛУШКА
        console.log("🎮 Action from", userId, msg);

        // Тут потом:
        // 1. проверить что его ход
        // 2. симулировать
        // 3. создать Events
        // 4. обновить BattleState
        // 5. отправить turn_result
    }

    handleReconnect(ws, userId, battleVersion) {
        this.players.set(userId, ws);

        ws.send(JSON.stringify({
            type: "battle_init",
            battleVersion: this.battleVersion,
            state: this.state
        }));
    }

    handleDisconnect(userId) {
        this.players.delete(userId);
        console.log("🔴 Player left battle", userId);
    }

    broadcast(msg) {
        const json = JSON.stringify(msg);
        for (const ws of this.players.values()) {
            ws.send(json);
        }
    }

    createInitialState(match) {
        // ПОКА ПРОСТАЯ ЗАГЛУШКА
        return {
            MatchId: match.id,
            Width: 10,
            Height: 10,
            Units: {},
            TurnNumber: 0,
            CurrentUnitId: -1
        };
    }
}
