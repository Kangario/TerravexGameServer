import { jest } from "@jest/globals";
import { BattleSession } from "../battles/BattleSession.js";

function createSnapshot() {
    return {
        matchId: "match-1",
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
});
