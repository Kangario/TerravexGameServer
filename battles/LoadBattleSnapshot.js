// battles/loadBattleSnapshot.js

import { gsRedis } from "../config/redis.js";
import { BattleSnapshot } from "./BattleSnapshot.js";
import { TerrainGenerator } from "../GenerationTerrain/TerrainGenerator.js";

export async function loadBattleSnapshot(matchId) {
    const raw = await gsRedis.get(`gs:match:${matchId}`);
    if (!raw) {
        throw new Error(`Match ${matchId} not found`);
    }

    const match = JSON.parse(raw);

    const terrain = TerrainGenerator.generate({
        width: 15,
        height: 40,
        seed: match.seed
    });

    return BattleSnapshot.create({
        matchId,
        seed: match.seed,
        terrain,
        units: match.units
    });
}
