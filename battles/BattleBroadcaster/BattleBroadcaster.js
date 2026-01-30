export class BattleBroadcaster {

    constructor(battle) {
        this.battle = battle;
    }

    send(msg) {
        const json = JSON.stringify(msg);
        for (const ws of this.battle.players.values())
            ws.send(json);
    }
}
