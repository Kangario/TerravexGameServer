export class BattleSnapshot {

    constructor({ matchId, seed, terrain, units }) {
        this.matchId = matchId;
        this.seed = seed;
        this.terrain = terrain;
        this.units = units;

        // 🔒 делаем snapshot immutable
        Object.freeze(this.terrain);
        this.units.forEach(u => Object.freeze(u));
        Object.freeze(this.units);
        Object.freeze(this);
    }

    // =========================
    // FACTORY
    // =========================
    static create({ matchId, seed, terrain, units }) {

        if (!matchId) throw new Error("BattleSnapshot: matchId required");
        if (!seed) throw new Error("BattleSnapshot: seed required");
        if (!terrain) throw new Error("BattleSnapshot: terrain required");
        if (!Array.isArray(units)) throw new Error("BattleSnapshot: units must be array");

        return new BattleSnapshot({
            matchId,
            seed,
            terrain,
            units
        });
    }

    // =========================
    // SERIALIZATION
    // =========================
    toJSON() {
        return {
            matchId: this.matchId,
            seed: this.seed,
            terrain: this.terrain,
            units: this.units
        };
    }
}