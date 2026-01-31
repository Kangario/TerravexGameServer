export class UnitState {

    constructor({ id, team, stats, position }) {
        this.id = id;
        this.team = team;

        this.maxHp = stats.hp;
        this.hp = stats.hp;

        this.maxAp = stats.ap;
        this.ap = stats.ap;

        this.initiative = stats.initiative;

        this.x = position.x;
        this.y = position.y;
    }

    static fromSnapshot(snapshotUnit) {
        return new UnitState({
            id: snapshotUnit.id,
            team: snapshotUnit.team,
            stats: snapshotUnit.baseStats,
            position: snapshotUnit.position
        });
    }

    resetAP() {
        this.ap = this.maxAp;
    }

    toJSON() {
        return {
            id: this.id,
            team: this.team,
            hp: this.hp,
            ap: this.ap,
            x: this.x,
            y: this.y
        };
    }
}
