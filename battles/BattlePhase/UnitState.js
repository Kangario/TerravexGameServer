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
            id: h.heroId,
            team: h.team,
            hasPosition: !!h.position,
            hp: h.hp,
            ap: h.ap,
            initiative: h.initiative
        });

        this.id = h.heroId;
        this.team = h.team;
        
        this.templateId = h.templateId;
        this.ownerId = h.playerId ?? h.ownerId;

        this.name = h.name;
        this.gender = h.gender;

        this.hp = h.hp;
        this.maxHp = h.maxHp;
        this.maxAp = h.ap;
        this.ap = h.ap;
        
        this.initiative = h.initiative;

        this.damageP = h.damageP;
        this.damageM = h.damageM;

        this.defenceP = h.defenceP;
        this.defenceM = h.defenceM;
        
        this.attackRange = h.attackRange;
        this.moveCost = h.moveCost;
            
        this.level = h.level;
        
        this.skills = h.skills;
        this.equipmentSlots = h.equipmentSlots;
        
        if (!h.position) {
            log("WARNING: missing position, defaulting to (0,0)", {
                unitId: h.heroId
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

        this.ap = this.maxAp;

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
            classHero: this.gender,
            hp: this.hp,
            maxHp: this.maxHp,
            ap: this.ap,
            initiative: this.initiative,
            damageP: this.damageP,
            damageM: this.damageM,
            defenceP: this.defenceP,
            defenceM: this.defenceM,
            attackRange: this.attackRange,
            moveCost: this.moveCost,

            skills: this.skills,
            equipmentSlots: this.equipmentSlots,
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
