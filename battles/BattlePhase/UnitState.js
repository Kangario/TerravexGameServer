export class UnitState {

    constructor(h) {
        this.id = h.id;
        this.team = h.team;

        this.heroId = h.heroId;
        this.templateId = h.templateId;
        this.ownerId = h.playerId; // или ownerId

        this.name = h.name;
        this.class = h.class;

        this.hp = h.hp;
        this.maxHp = h.maxHp;
        this.ap = h.ap;

        this.initiative = h.initiative;

        this.damageP = h.damageP;
        this.damageM = h.damageM;

        this.defenceP = h.defenceP;
        this.defenceM = h.defenceM;

        this.speed = h.speed;
        this.attackSpeed = h.attackSpeed;

        this.level = h.level;

        this.x = h.position.x;
        this.y = h.position.y;
    }

    static fromSnapshot(snapshotUnit) {
        return new UnitState(snapshotUnit);
    }

    resetAP() {
        this.ap = 6;
    }

    toJSON() {
        return {
            id: this.id,
            team: this.team,
            heroId: this.heroId,
            templateId: this.templateId,
            ownerId: this.ownerId,
            name: this.name,
            class: this.class,
            hp: this.hp,
            maxHp: this.maxHp,
            ap: this.ap,
            initiative: this.initiative,
            damageP: this.damageP,
            damageM: this.damageM,
            defenceP: this.defenceP,
            defenceM: this.defenceM,
            speed: this.speed,
            attackSpeed: this.attackSpeed,
            level: this.level,
            x: this.x,
            y: this.y,
        };
    }
}
