function log(stage, data = {}) {
    console.log(`[BattleSnapshot][${new Date().toISOString()}] ${stage}`, data);
}

export class BattleSnapshot {

    constructor({ matchId, seed, terrain, units, mode = "PVP", players = [], pve = null }) {
        this.matchId = matchId;
        this.seed = seed;
        this.terrain = terrain;
        this.units = units;
        this.mode = mode;
        this.players = players;
        this.pve = pve;
        
        log("INSTANCE CREATED", {
            matchId,
            unitsCount: units.length,
            mode
        });
    }

    static create({ matchId, seed, terrain, units, mode = "PVP", players = [], pve = null }) {
        log("CREATE called", {
            matchId,
            hasSeed: !!seed,
            hasTerrain: !!terrain,
            unitsType: typeof units,
            unitsCount: Array.isArray(units) ? units.length : null,
            mode
        });

        try {
            if (!matchId) throw new Error("BattleSnapshot: matchId required");
            if (!seed) throw new Error("BattleSnapshot: seed required");
            if (!terrain) throw new Error("BattleSnapshot: terrain required");
            if (!Array.isArray(units)) throw new Error("BattleSnapshot: units must be array");

            const snapshot = new BattleSnapshot({
                matchId,
                seed,
                terrain,
                units,
                mode,
                players,
                pve
            });

            log("CREATE success", {
                matchId,
                unitsCount: units.length
            });

            return snapshot;

        } catch (err) {
            console.error("[BattleSnapshot][ERROR] create failed", {
                matchId,
                error: err.stack || err.message
            });

            throw err; // ❗ обязательно пробрасываем
        }
    }

    toJSON() {
        log("toJSON", {
            matchId: this.matchId,
            unitsCount: this.units.length
        });

        return {
            matchId: this.matchId,
            seed: this.seed,
            terrain: this.terrain,
            units: this.units,
            mode: this.mode,
            players: this.players,
            pve: this.pve
        };
    }
}
