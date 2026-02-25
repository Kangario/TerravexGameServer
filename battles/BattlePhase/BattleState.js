import { UnitState } from "./UnitState.js";

function log(stage, data = {}) {
    console.log(
        `[BattleState][${new Date().toISOString()}] ${stage}`,
        data
    );
}

export class BattleState {

    constructor({ snapshot }) {
        if (!snapshot) {
            throw new Error("BattleState: snapshot is required");
        }

        log("CONSTRUCTOR START", {
            matchId: snapshot.matchId,
            unitsCount: snapshot.units?.length,
            hasTerrain: !!snapshot.terrain
        });
    
        this.matchId = snapshot.matchId;
        this.turnNumber = 0;
        this.units = new Map();
        this.initiativeQueue = [];
        this.activeUnitId = null;

        this.finished = false;
        this.winnerTeam = null;

        this.terrain = snapshot.terrain;

        this.initFromSnapshot(snapshot);

        log("CONSTRUCTOR END", {
            matchId: this.matchId,
            activeUnitId: this.activeUnitId,
            initiativeOrder: [...this.initiativeQueue]
        });
    }

    // =========================
    // SNAPSHOT → RUNTIME
    // =========================
    initFromSnapshot(snapshot) {
        if (!Array.isArray(snapshot.units)) {
            throw new Error("BattleState: snapshot.units must be array");
        }

        log("INIT FROM SNAPSHOT START", {
            unitsCount: snapshot.units.length
        });

        snapshot.units.forEach((unit, index) => {
            if (!unit) {
                throw new Error(`BattleState: unit[${index}] is undefined`);
            }

            log("CREATING UNIT STATE", {
                index,
                unitId: unit.id,
                team: unit.team
            });

            const state = UnitState.fromSnapshot(unit);

            this.units.set(state.id, state);
            this.initiativeQueue.push(state.id);
        });

        // сортировка инициативы
        this.initiativeQueue.sort((a, b) => {
            return (
                this.units.get(b).initiative -
                this.units.get(a).initiative
            );
        });

        this.activeUnitId = this.initiativeQueue[0];

        log("INIT FROM SNAPSHOT END", {
            totalUnits: this.units.size,
            initiativeOrder: [...this.initiativeQueue],
            activeUnitId: this.activeUnitId
        });
    }

    // =========================
    // ACCESSORS
    // =========================
    getUnit(unitId) {
        return this.units.get(unitId);
    }

    getActiveUnit() {
        return this.units.get(this.activeUnitId);
    }

    getUnitByPosition(x, y) {
        for (const unit of this.units.values()) {
            if (unit.hp > 0 && unit.x === x && unit.y === y) {
                return unit;
            }
        }

        return null;
    }

    isAlive(unitId) {
        const unitIdTemp = Number(unitId);
        const u = this.units.get(unitIdTemp);
        return u && u.hp > 0;
    }

    // =========================
    // TURN FLOW
    // =========================
    startTurn() {
        this.turnNumber += 1;

        const unit = this.getActiveUnit();

        log("TURN START", {
            turn: this.turnNumber,
            activeUnitId: unit.id,
            team: unit.team,
            apBefore: unit.ap
        });

        
    }

    endTurn() {
        const endedUnitId = this.activeUnitId;

        this.initiativeQueue.push(this.initiativeQueue.shift());
        this.activeUnitId = this.initiativeQueue[0];
        const unit = this.getActiveUnit();
        unit.resetAP();
        log("turn_end", {
            endedUnitId,
            nextActiveUnitId: this.activeUnitId,
            initiativeOrder: [...this.initiativeQueue]
        });
    }

    // =========================
    // COMBAT
    // =========================
    applyDamage(unitId, targetId)
    {
        const unitIdNumber = Number(unitId);
        const targetIdNumber = Number(targetId);
        const attacker = this.getUnit(unitIdNumber);
        if (!attacker) return null;

        const target = this.getUnit(targetIdNumber);
        if (!target) return null;

        const damage = attacker.damageP;

        const hpBefore = target.hp;

        target.hp = Math.max(0, target.hp - damage);

        const hpAfter = target.hp;

        const isDead = hpAfter === 0;

        log("DAMAGE APPLIED", {
            attacker: unitIdNumber,
            targetIdNumber,
            damage,
            hpBefore,
            hpAfter
        });

        if (isDead)
        {
            this.handleUnitDeath(targetIdNumber);
        }

        // 🔥 возвращаем результат
        return {
            attackerId: unitIdNumber,
            targetId: targetIdNumber,
            damage: damage,
            hpBefore: hpBefore,
            hpAfter: hpAfter,
            isDead: isDead
        };
    }

    moveUnit(unitId, x, y) {
        const unitIdNumber = Number(unitId);
        const unit = this.getUnit(unitIdNumber);
        if (!unit) return;

        const before = { x: unit.x, y: unit.y };

        unit.x = x;
        unit.y = y;

        log("UNIT MOVED", {
            unitId,
            from: before,
            to: { x, y }
        });
    }

    spendAp(unitId, amount) {
        const unitIdNumber = Number(unitId);
        const apCost = Number(amount);
        const unit = this.getUnit(unitIdNumber);

        if (!unit) {
            throw new Error("Unit not found");
        }

        if (!Number.isFinite(apCost) || apCost <= 0) {
            throw new Error("Invalid AP cost");
        }

        if (unit.ap < apCost) {
            throw new Error("Not enough AP");
        }

        unit.ap -= apCost;
    }

    handleUnitDeath(unitId) {
        log("UNIT DEATH", {
            unitId
        });

        this.units.delete(unitId);
        this.initiativeQueue = this.initiativeQueue.filter(id => id !== unitId);

        if (this.activeUnitId === unitId) {
            this.endTurn();
        }

        this.checkBattleEnd();
    }

    // =========================
    // BATTLE END
    // =========================
    checkBattleEnd() {
        const teamsAlive = new Set();
        this.units.forEach(u => teamsAlive.add(u.team));

        log("CHECK BATTLE END", {
            teamsAlive: [...teamsAlive]
        });

        if (teamsAlive.size <= 1) {
            this.finished = true;
            this.winnerTeam = [...teamsAlive][0] ?? null;

            log("BATTLE FINISHED", {
                winnerTeam: this.winnerTeam
            });
        }
    }

    // =========================
    // CLIENT STATE
    // =========================
    toClientState() {
        log("TO CLIENT STATE", {
            turn: this.turnNumber,
            terrain: this.terrain,
            activeUnitId: this.activeUnitId,
            unitsCount: this.units.size,
            finished: this.finished
        });

        return {
            matchId: this.matchId,
            terrain: this.terrain,
            turnNumber: this.turnNumber,
            activeUnitId: this.activeUnitId,
            units: [...this.units.values()].map(u => u.toJSON()),
            initiativeOrder: [...this.initiativeQueue],
            finished: this.finished,
            winnerTeam: this.winnerTeam
        };
    }
}
