import { jest } from "@jest/globals";
import { BattleSession } from "../battles/BattleSession.js";

function createSnapshot() {
    return {
        matchId: "match-final-hit",
        seed: 1,
        terrain: { width: 15, height: 40 },
        units: [
            {
                heroId: 101,
                playerId: "u1",
                team: 1,
                hp: 100,
                maxHp: 100,
                ap: 4,
                initiative: 10,
                damageP: 100,
                damageM: 0,
                defenceP: 5,
                defenceM: 2,
                attackRange: 1,
                moveCost: 1,
                position: { x: 0, y: 0 }
            },
            {
                heroId: 202,
                playerId: "u2",
                team: 2,
                hp: 50,
                maxHp: 50,
                ap: 4,
                initiative: 8,
                damageP: 15,
                damageM: 0,
                defenceP: 5,
                defenceM: 2,
                attackRange: 1,
                moveCost: 1,
                position: { x: 1, y: 0 }
            }
        ]
    };
}

function createMultiKillSnapshot() {
    const snapshot = createSnapshot();

    snapshot.matchId = "match-multi-kill";
    snapshot.units = [
        snapshot.units[0],
        snapshot.units[1],
        {
            heroId: 303,
            playerId: "u2",
            team: 2,
            hp: 50,
            maxHp: 50,
            ap: 4,
            initiative: 7,
            damageP: 15,
            damageM: 0,
            defenceP: 5,
            defenceM: 2,
            attackRange: 1,
            moveCost: 1,
            position: { x: 0, y: 1 }
        }
    ];

    return snapshot;
}

describe("Battle end event contract", () => {
    test("fatal attack sends final damage before battle_end and includes deadUnitIds", () => {
        const session = new BattleSession(createSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);

        session.broadcast = jest.fn();
        session.sendToPlayer = jest.fn();
        session.enqueueBattleRewards = jest.fn().mockResolvedValue();

        session.applyEvents([{
            type: "unit_attack",
            unitId: 101,
            target: 202,
            unitAp: 2
        }]);

        expect(session.broadcast).toHaveBeenCalledWith({
            type: "events",
            events: [
                {
                    type: "unit_attack",
                    unitId: 101,
                    target: 202,
                    unitAp: 2
                },
                {
                    type: "damage",
                    attackerId: 101,
                    targetId: 202,
                    damage: 100,
                    hpBefore: 50,
                    hpAfter: 0,
                    isDead: true,
                    unitAp: 4
                },
                {
                    type: "end_battle",
                    winnerTeam: 1
                }
            ]
        });

        expect(session.broadcast).toHaveBeenCalledWith({
            type: "battle_end",
            winnerTeam: 1,
            winners: ["u1"],
            losers: ["u2"],
            deadUnitIds: [202]
        });
    });

    test("fatal attacks add 50 xp per killed entity to the killer hero reward", () => {
        const session = new BattleSession(createMultiKillSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);

        session.broadcast = jest.fn();
        session.sendToPlayer = jest.fn();
        session.enqueueBattleRewards = jest.fn().mockResolvedValue();

        session.applyEvents([{ type: "unit_attack", unitId: 101, target: 202 }]);
        session.applyEvents([{ type: "unit_attack", unitId: 101, target: 303 }]);

        const plan = session.buildRewardsPlan({
            winners: ["u1"],
            losers: ["u2"]
        });

        expect(plan.get("u1").killXp).toEqual([{
            heroId: 101,
            instanceId: null,
            unitId: 101,
            kills: 2,
            killedUnitIds: [202, 303],
            xpDelta: 100
        }]);
    });
});
