// battles/loadBattleSnapshot.js

import { gsRedis } from "../config/redis.js";
import { BattleSnapshot } from "./BattleSnapshot.js";
import { TerrainGenerator } from "../GenerationTerrain/TerrainGenerator.js";

function log(stage, data = {}) {
    console.log(`[BattleSnapshotLoader][${new Date().toISOString()}] ${stage}`, data);
}

function buildPveInitData(match) {
    if (match?.mode !== "PVE") {
        return null;
    }

    const botPlayer = Array.isArray(match.players)
        ? match.players.find((player) => player?.isBot)
        : null;

    const creatureSource = Array.isArray(match.units)
        ? match.units.filter((unit) => unit?.team === botPlayer?.teamId)
        : [];

    const groupedCreatures = new Map();

    for (const unit of creatureSource) {
        const type = unit?.name ?? unit?.Name ?? unit?.templateId ?? "Unknown";
        const existing = groupedCreatures.get(type);

        if (existing) {
            existing.count += 1;
            continue;
        }

        groupedCreatures.set(type, {
            type,
            count: 1
        });
    }

    return {
        enemyPlayer: botPlayer ? {
            userId: botPlayer.userId,
            username: botPlayer.username,
            teamId: botPlayer.teamId,
            isBot: Boolean(botPlayer.isBot)
        } : null,
        creatures: [...groupedCreatures.values()]
    };
}

export async function loadBattleSnapshot(matchId) {
    const startedAt = Date.now();

    log("START loadBattleSnapshot", { matchId });

    try {
        const redisKey = `gs:match:${matchId}`;
        log("Redis GET", { redisKey });

        const raw = await gsRedis.get(redisKey);

        if (!raw) {
            log("MATCH NOT FOUND", { matchId });
            throw new Error(`Match ${matchId} not found`);
        }

        log("Redis HIT", {
            matchId,
            bytes: raw.length
        });

        const match = JSON.parse(raw);

        log("Full Json", JSON.stringify(match));
        
        log("Parsed match", {
            seed: match.seed,
            unitsCount: match.units?.length || 0
        });

        const terrainStart = Date.now();

        log("Generating terrain", {
            width: 15,
            height: 40,
            seed: match.seed
        });

        const terrain = TerrainGenerator.generate({
            width: 15,
            height: 40,
            seed: match.seed
        });

        log("Terrain generated", {
            ms: Date.now() - terrainStart
        });

        const snapshot = BattleSnapshot.create({
            matchId,
            seed: match.seed,
            terrain,
            units: match.units,
            mode: match.mode ?? "PVP",
            players: Array.isArray(match.players) ? match.players : [],
            pve: buildPveInitData(match)
        });

        log("Snapshot created", {
            totalMs: Date.now() - startedAt
        });

        return snapshot;

    } catch (err) {
        console.error("[BattleSnapshotLoader][ERROR]", {
            matchId,
            error: err.stack || err.message
        });

        throw err; // ❗ обязательно пробрасываем дальше
    }
}
