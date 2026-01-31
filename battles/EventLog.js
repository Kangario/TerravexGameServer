export class EventLog {

    constructor() {
        this.events = [];
    }

    push(event) {
        this.events.push(event);
    }

    merge(otherLog) {
        this.events.push(...otherLog.events);
    }

    isEmpty() {
        return this.events.length === 0;
    }

    toJSON() {
        return this.events;
    }
}