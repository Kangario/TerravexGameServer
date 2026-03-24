import { jest } from "@jest/globals";
import { BattleSession } from "../battles/BattleSession.js";

function createSnapshot() {
    return {
        matchId: "match-1",
        seed: 1,
        mode: "PVP",
        players: [
            { userId: "u1", username: "Mike", teamId: 1, rating: 1500, level: 10 },
            { userId: "u2", username: "Alex", teamId: 2, rating: 1520, level: 11 }
        ],
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
                damageP: 15,
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
                hp: 100,
                maxHp: 100,
                ap: 4,
                initiative: 8,
                damageP: 15,
                damageM: 0,
                defenceP: 5,
                defenceM: 2,
                attackRange: 1,
                moveCost: 1,
                position: { x: 1, y: 1 }
            }
        ]
    };
}

function createSocket() {
    return {
        send: jest.fn(),
        close: jest.fn()
    };
}

describe("BattleSession reconnect flow", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test("addPlayer returns reconnect token in battle_init", () => {
        const session = new BattleSession(createSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);
        session.initializePlayerRegistry();

        const ws = createSocket();

        session.addPlayer("u1", ws);

        const payload = JSON.parse(ws.send.mock.calls[0][0]);
        expect(payload.type).toBe("battle_init");
        expect(payload.teamId).toBe(1);
        expect(payload.reconnect.sessionToken).toBeTruthy();
        expect(payload.reconnect.graceMs).toBeGreaterThan(0);
        expect(payload.timeline.phase).toBe("INIT");
        expect(payload.timeline.serverNow).toBeGreaterThan(0);
        expect(payload.mode).toBe("PVP");
        expect(payload.pve).toBeNull();
        expect(payload.playersMeta).toEqual([
            {
                userId: "u1",
                username: "Mike",
                teamId: 1,
                rating: 1500,
                level: 10,
                isBot: false
            },
            {
                userId: "u2",
                username: "Alex",
                teamId: 2,
                rating: 1520,
                level: 11,
                isBot: false
            }
        ]);
    });

    test("disconnect keeps player slot and reconnect restores latest socket", () => {
        const session = new BattleSession(createSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);
        session.initializePlayerRegistry();

        const oldWs = createSocket();
        session.addPlayer("u1", oldWs);

        const token = session.ensurePlayerPresence("u1").sessionToken;
        session.disconnectPlayer("u1", oldWs);

        expect(session.players.has("u1")).toBe(true);
        expect(session.players.get("u1")).toBeNull();

        const newWs = createSocket();
        const ok = session.reconnectPlayer(newWs, "u1", token);

        expect(ok).toBe(true);
        expect(session.players.get("u1")).toBe(newWs);
        expect(newWs.send).toHaveBeenCalled();
    });

    test("reconnect rejects invalid token", () => {
        const session = new BattleSession(createSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);
        session.initializePlayerRegistry();

        const ws = createSocket();
        const ok = session.reconnectPlayer(ws, "u1", "wrong-token");

        expect(ok).toBe(false);
        expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
            type: "error",
            message: "Reconnect rejected: invalid session token"
        });
    });

    test("reconnect battle_init includes current phase timer data", () => {
        const session = new BattleSession(createSnapshot());
        session.contexPlayers = new Map([
            ["u1", 1],
            ["u2", 2]
        ]);
        session.initializePlayerRegistry();
        session.phase = "AWAIT_TURN_ACTIONS";
        session.setPhaseWindow("turn", 40000);

        const ws = createSocket();
        const token = session.ensurePlayerPresence("u1").sessionToken;
        const ok = session.reconnectPlayer(ws, "u1", token);

        expect(ok).toBe(true);

        const payload = JSON.parse(ws.send.mock.calls[0][0]);
        expect(payload.turn).toBeTruthy();
        expect(payload.turn.activeUnitId).toBe(101);
        expect(payload.turn.remainingMs).toBeGreaterThanOrEqual(0);
    });

    test("pve init includes creatures summary for client rendering", () => {
        const snapshot = {
            ...createSnapshot(),
            mode: "PVE",
            players: [
                { userId: "u1", username: "Mike", teamId: 1, rating: 1500, level: 10 },
                { userId: "bot:u1", username: "Arena Bot", BotType: "Skelet", teamId: 2, rating: 1500, level: 10, isBot: true }
            ],
            pve: {
                enemyPlayer: {
                    userId: "bot:u1",
                    username: "Arena Bot",
                    BotType: "Skelet",
                    teamId: 2,
                    isBot: true
                },
                creatures: [
                    { type: "Скелет", count: 2 },
                    { type: "Лучник", count: 1 }
                ]
            }
        };

        const session = new BattleSession(snapshot);
        session.contexPlayers = new Map([
            ["u1", 1],
            ["bot:u1", 2]
        ]);
        session.initializePlayerRegistry();

        const ws = createSocket();
        session.addPlayer("u1", ws);

        const payload = JSON.parse(ws.send.mock.calls[0][0]);
        expect(payload.mode).toBe("PVE");
        expect(payload.pve).toBeNull();
        expect(payload.playersMeta).toEqual([
            {
                userId: "u1",
                username: "Mike",
                teamId: 1,
                rating: 1500,
                level: 10,
                isBot: false
            },
            {
                userId: "bot:u1",
                teamId: 2,
                BotType: "Skelet"
            }
        ]);
    });

    test("server-controlled pve opponent is marked connected without socket", () => {
        const snapshot = {
            ...createSnapshot(),
            mode: "PVE",
            players: [
                { userId: "u1", username: "Mike", teamId: 1, rating: 1500, level: 10 },
                { userId: "bot:skelet", username: "Skelet", BotType: "Skelet", teamId: 2, rating: 0, level: 1, isBot: true }
            ],
            pve: {
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
            },
            units: [
                createSnapshot().units[0],
                {
                    heroId: 303,
                    playerId: "bot:skelet",
                    team: 2,
                    hp: 90,
                    maxHp: 90,
                    ap: 4,
                    initiative: 8,
                    damageP: 14,
                    damageM: 0,
                    defenceP: 3,
                    defenceM: 1,
                    attackRange: 1,
                    moveCost: 1,
                    position: { x: 7, y: 38 }
                }
            ]
        };

        const session = new BattleSession(snapshot);
        session.contexPlayers = session.buildPlayerTeamsMap(snapshot.players);
        session.initializePlayerRegistry();

        const ws = createSocket();
        session.addPlayer("u1", ws);

        const payload = JSON.parse(ws.send.mock.calls[0][0]);
        expect(payload.players).toEqual([
            {
                userId: "u1",
                connected: true,
                reconnectDeadlineAt: null
            },
            {
                userId: "bot:skelet",
                connected: true,
                reconnectDeadlineAt: null
            }
        ]);
    });
});
