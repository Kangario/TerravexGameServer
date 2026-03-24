import { buildPveInitData, normalizePveMatch } from "../battles/PveEnemyCatalog.js";

describe("PveEnemyCatalog", () => {
    test("normalizePveMatch injects Skelet bot when matchmaking provides only player side", () => {
        const match = {
            mode: "PVE",
            players: [
                { userId: "u1", username: "Mike", teamId: 1, rating: 1500, level: 10 }
            ],
            units: [
                {
                    heroId: 101,
                    playerId: "u1",
                    team: 1,
                    hp: 100,
                    maxHp: 100,
                    ap: 4,
                    initiative: 10,
                    damageP: 15,
                    damageM: 0,
                    defenceP: 5,
                    defenceM: 2,
                    attackRange: 1,
                    moveCost: 1,
                    position: { x: 0, y: 0 }
                }
            ]
        };

        const normalized = normalizePveMatch(match);

        expect(normalized.players).toHaveLength(2);
        expect(normalized.players[1]).toMatchObject({
            userId: "bot:skelet",
            username: "Skelet",
            BotType: "Skelet",
            teamId: 2,
            isBot: true
        });
        expect(normalized.units).toHaveLength(2);
        expect(normalized.units[1]).toMatchObject({
            playerId: "bot:skelet",
            team: 2,
            name: "Skelet"
        });
        expect(normalized.pve).toEqual({
            enemyPlayer: {
                userId: "bot:skelet",
                username: "Skelet",
                BotType: "Skelet",
                teamId: 2,
                isBot: true
            },
            creatures: [
                { type: "Skelet", count: 1 }
            ]
        });
    });

    test("buildPveInitData summarizes bot creatures by type", () => {
        const pve = buildPveInitData({
            players: [
                { userId: "u1", teamId: 1 },
                { userId: "bot:skelet", username: "Skelet", BotType: "Skelet", teamId: 2, isBot: true }
            ],
            units: [
                { heroId: 1, playerId: "bot:skelet", team: 2, name: "Skelet" },
                { heroId: 2, playerId: "bot:skelet", team: 2, name: "Skelet" },
                { heroId: 3, playerId: "u1", team: 1, name: "Knight" }
            ]
        });

        expect(pve).toEqual({
            enemyPlayer: {
                userId: "bot:skelet",
                username: "Skelet",
                BotType: "Skelet",
                teamId: 2,
                isBot: true
            },
            creatures: [
                { type: "Skelet", count: 2 }
            ]
        });
    });
});
