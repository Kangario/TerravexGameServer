function getDefaultBotTeamId(players) {
    const usedTeams = new Set(
        (Array.isArray(players) ? players : [])
            .map((player) => player?.teamId)
            .filter((teamId) => Number.isInteger(teamId))
    );

    return usedTeams.has(1) ? 2 : 1;
}

function getNextHeroId(units) {
    let maxHeroId = 0;

    for (const unit of Array.isArray(units) ? units : []) {
        const heroId = Number(unit?.heroId ?? unit?.id ?? 0);
        if (Number.isFinite(heroId) && heroId > maxHeroId) {
            maxHeroId = heroId;
        }
    }

    return Math.max(maxHeroId + 1, 100000);
}

function buildSkeletEnemy({ ownerId, teamId, nextHeroId }) {
    return {
        player: {
            userId: ownerId,
            username: "Skelet",
            BotType: "Skelet",
            teamId,
            rating: 0,
            level: 1,
            isBot: true
        },
        units: [
            {
                heroId: nextHeroId,
                playerId: ownerId,
                team: teamId,
                templateId: "skelet_warrior",
                name: "Skelet",
                hp: 90,
                maxHp: 90,
                ap: 4,
                initiative: 7,
                damageP: 14,
                damageM: 0,
                defenceP: 3,
                defenceM: 1,
                attackRange: 1,
                moveCost: 1,
                level: 1,
                position: { x: 7, y: 38 }
            }
        ]
    };
}

const ENEMY_BUILDERS = {
    Skelet: buildSkeletEnemy
};

export function buildPveInitData({ players, units }) {
    const botPlayer = Array.isArray(players)
        ? players.find((player) => player?.isBot)
        : null;

    const creatureSource = Array.isArray(units)
        ? units.filter((unit) => unit?.team === botPlayer?.teamId)
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
            username: botPlayer.username ?? null,
            BotType: botPlayer.BotType ?? botPlayer.username ?? null,
            teamId: botPlayer.teamId,
            isBot: Boolean(botPlayer.isBot)
        } : null,
        creatures: [...groupedCreatures.values()]
    };
}

export function normalizePveMatch(match) {
    const players = Array.isArray(match?.players) ? [...match.players] : [];
    const units = Array.isArray(match?.units) ? [...match.units] : [];

    if (match?.mode !== "PVE") {
        return {
            players,
            units,
            pve: null
        };
    }

    const templateKey = match?.pve?.enemyTemplate ?? match?.enemyTemplate ?? "Skelet";
    const templateFactory = ENEMY_BUILDERS[templateKey] ?? ENEMY_BUILDERS.Skelet;
    const humanPlayer = players.find((player) => !player?.isBot) ?? null;
    const botPlayer = players.find((player) => player?.isBot) ?? null;
    const botUserId = botPlayer?.userId ?? `bot:${String(templateKey).toLowerCase()}`;
    const botTeamId = botPlayer?.teamId ?? getDefaultBotTeamId(players);
    const nextHeroId = getNextHeroId(units);

    if (!botPlayer) {
        const template = templateFactory({
            ownerId: botUserId,
            teamId: botTeamId,
            nextHeroId,
            humanPlayer
        });

        players.push(template.player);

        const hasBotUnits = units.some((unit) => {
            const ownerId = unit?.playerId ?? unit?.ownerId;
            return ownerId === template.player.userId || unit?.team === template.player.teamId;
        });

        if (!hasBotUnits) {
            units.push(...template.units);
        }
    } else if (!botPlayer.BotType) {
        botPlayer.BotType = String(templateKey);
    }

    const pve = buildPveInitData({ players, units });

    return {
        players,
        units,
        pve
    };
}
