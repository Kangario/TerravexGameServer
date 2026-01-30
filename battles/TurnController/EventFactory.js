export class EventFactory {

    constructor(battle) {
        this.battle = battle;
    }

    create(type, data) {
        return {
            EventIndex: ++this.battle.eventIndex,
            Type: type,
            ...data
        };
    }
}
