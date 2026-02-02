function log(stage, data = {}) {
    console.log(
        `[UnitState][${new Date().toISOString()}] ${stage}`,
        data
    );
}

export class UnitState {

    constructor(h) {
        // 🔴 КРИТИЧЕСКИЙ ЛОГ
        if (!h) {
            log("CONSTRUCTOR ERROR: h is undefined/null");
            throw new Error("UnitState constructor received invalid snapshotUnit");
        }

        log("CONSTRUCTOR START", {
            id: h.id,
            team: h.team,
            hasPosition: !!h.position,
            hp: h.hp,
            ap: h.ap,
            initiative: h.initiative
        });

        this.id = h.id;
        this.team = h.team;

        this.heroId = h.heroId;
        this.templateId = h.templateId;
        this.ownerId = h.playerId ?? h.ownerId;

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

        // 🟡 ПРОВЕРКА POSITION
        if (!h.position) {
            log("WARNING: missing position, defaulting to (0,0)", {
                unitId: h.id
            });
            this.x = 0;
            this.y = 0;
        } else {
            this.x = h.position.x;
            this.y = h.position.y;
        }

        log("CONSTRUCTOR SUCCESS", {
            id: this.id,
            team: this.team,
            hp: this.hp,
            ap: this.ap,
            position: { x: this.x, y: this.y }
        });
    }

    static fromSnapshot(snapshotUnit) {
        log("fromSnapshot called", {
            isUndefined: snapshotUnit === undefined,
            isNull: snapshotUnit === null,
            type: typeof snapshotUnit,
            keys: snapshotUnit ? Object.keys(snapshotUnit) : null
        });

        return new UnitState(snapshotUnit);
    }

    resetAP() {
        log("resetAP", {
            unitId: this.id,
            before: this.ap
        });

        this.ap = 6;

        log("resetAP done", {
            unitId: this.id,
            after: this.ap
        });
    }

    toJSON() {
        const json = {
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

        log("toJSON", {
            unitId: this.id,
            hp: this.hp,
            ap: this.ap,
            position: { x: this.x, y: this.y }
        });

        return json;
    }
}
