export class BattleState {

    constructor(initialState) {
        Object.assign(this, initialState);
    }

    getCurrentUnit() {
        return this.Units[this.CurrentUnitId];
    }

    isFinished() {
        return this.bBattleFinished;
    }
}