import { BattleState } from "../battles/BattlePhase/BattleState.js";

describe("BattleState runtime ids", () => {
    test("keeps both units when heroId is duplicated", () => {
        const state = new BattleState({
            snapshot: {
                matchId: "dup-hero",
                terrain: { width: 15, height: 40 },
                units: [
                    {
                        heroId: 777,
                        playerId: "u1",
                        team: 0,
                        hp: 10,
                        maxHp: 10,
                        ap: 4,
                        initiative: 10,
                        damageP: 5,
                        damageM: 0,
                        defenceP: 0,
                        defenceM: 0,
                        attackRange: 1,
                        moveCost: 1,
                        position: { x: 0, y: 0 }
                    },
                    {
                        heroId: 777,
                        playerId: "u2",
                        team: 1,
                        hp: 10,
                        maxHp: 10,
                        ap: 4,
                        initiative: 9,
                        damageP: 5,
                        damageM: 0,
                        defenceP: 0,
                        defenceM: 0,
                        attackRange: 1,
                        moveCost: 1,
                        position: { x: 1, y: 1 }
                    }
                ]
            }
        });

        const units = [...state.units.values()];

        expect(units).toHaveLength(2);
        expect(units[0].id).not.toBe(units[1].id);
        expect(units[0].heroId).toBe(777);
        expect(units[1].heroId).toBe(777);
        expect(state.initiativeQueue).toHaveLength(2);
    });
});
