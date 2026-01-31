import { UnitState } from "./UnitState.js";

export class BattleState {

    constructor({ snapshot }) {
        this.matchId = snapshot.matchId;
        this.turnNumber = 0;

        this.units = new Map();
        this.initiativeQueue = [];
        this.activeUnitId = null;

        this.finished = false;
        this.winnerTeam = null;
        
        this.terrain = snapshot.terrain;

        this.initFromSnapshot(snapshot);
    }
    
    initFromSnapshot(snapshot) {
        snapshot.units.forEach(unit => {
            const state = UnitState.fromSnapshot(unit);
            this.units.set(state.id, state);
            this.initiativeQueue.push(state.id);
        });
        
        this.initiativeQueue.sort((a, b) => {
            return (
                this.units.get(b).initiative -
                this.units.get(a).initiative
            );
        });

        this.activeUnitId = this.initiativeQueue[0];
    }
    
    getUnit(unitId) {
        return this.units.get(unitId);
    }

    getActiveUnit() {
        return this.units.get(this.activeUnitId);
    }

    isAlive(unitId) {
        const u = this.units.get(unitId);
        return u && u.hp > 0;
    }

    startTurn() {
        this.turnNumber += 1;

        const unit = this.getActiveUnit();
        unit.resetAP();
    }

    endTurn() {
        this.initiativeQueue.push(this.initiativeQueue.shift());
        this.activeUnitId = this.initiativeQueue[0];
    }
    
    applyDamage(targetId, amount) {
        const unit = this.getUnit(targetId);
        unit.hp = Math.max(0, unit.hp - amount);

        if (unit.hp === 0) {
            this.handleUnitDeath(targetId);
        }
    }

    moveUnit(unitId, x, y) {
        const unit = this.getUnit(unitId);
        unit.x = x;
        unit.y = y;
    }

    handleUnitDeath(unitId) {
        this.units.delete(unitId);
        this.initiativeQueue = this.initiativeQueue.filter(id => id !== unitId);

        if (this.activeUnitId === unitId) {
            this.endTurn();
        }

        this.checkBattleEnd();
    }

    checkBattleEnd() {
        const teamsAlive = new Set();
        this.units.forEach(u => teamsAlive.add(u.team));

        if (teamsAlive.size <= 1) {
            this.finished = true;
            this.winnerTeam = [...teamsAlive][0] ?? null;
        }
    }
    
    toClientState() {
        return {
            matchId: this.matchId,
            turnNumber: this.turnNumber,
            activeUnitId: this.activeUnitId,
            units: [...this.units.values()].map(u => u.toJSON()),
            initiativeOrder: [...this.initiativeQueue],
            finished: this.finished,
            winnerTeam: this.winnerTeam
        };
    }
}