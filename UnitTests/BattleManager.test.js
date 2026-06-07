import { jest } from "@jest/globals";

const loadBattleSnapshot = jest.fn();
const mockCreate = jest.fn();
const gsRedis = {
    type: jest.fn(),
    del: jest.fn(),
    zRem: jest.fn(),
    sRem: jest.fn(),
    hDel: jest.fn()
};
const mmRedis = {
    del: jest.fn()
};

jest.unstable_mockModule("../battles/LoadBattleSnapshot.js", () => ({
    loadBattleSnapshot
}));

jest.unstable_mockModule("../battles/BattleSession.js", () => ({
    BattleSession: {
        create: mockCreate
    }
}));

jest.unstable_mockModule("../config/redis.js", () => ({
    gsRedis,
    mmRedis
}));

let BattleManager;
let battle;

function createSnapshot(matchId) {
    const userIds = ["u1", "u2", "u3", "u5", "u6", "u7", "u9"];

    return {
        matchId,
        players: userIds.map((userId, index) => ({
            userId,
            teamId: index + 1
        })),
        units: userIds.map((userId, index) => ({
            heroId: 100 + index,
            playerId: userId,
            team: index + 1
        }))
    };
}

beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    battle = {
        addPlayer: jest.fn(),
        reconnectPlayer: jest.fn(() => true),
        disconnectPlayer: jest.fn(),
        ensurePlayerPresence: jest.fn(() => ({ sessionToken: "server-token" })),
        onFinished: jest.fn(),
        startBattle: jest.fn()
    };

    loadBattleSnapshot.mockImplementation((matchId) => createSnapshot(matchId));
    mockCreate.mockResolvedValue(battle);
    gsRedis.type.mockResolvedValue("none");
    gsRedis.del.mockResolvedValue(1);
    gsRedis.zRem.mockResolvedValue(1);
    gsRedis.sRem.mockResolvedValue(1);
    gsRedis.hDel.mockResolvedValue(1);
    mmRedis.del.mockResolvedValue(1);

    ({ BattleManager } = await import("../battles/BattleManager.js"));
});

test("getOrCreateBattle creates and caches a battle", async () => {
    const first = await BattleManager.getOrCreateBattle("m1");
    const second = await BattleManager.getOrCreateBattle("m1");

    expect(loadBattleSnapshot).toHaveBeenCalledTimes(1);
    expect(loadBattleSnapshot).toHaveBeenCalledWith("m1");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(first).toBe(battle);
    expect(second).toBe(battle);
});

test("bindSocket writes matchId, userId and sessionToken", () => {
    const ws = {};

    BattleManager.bindSocket(ws, {
        matchId: "m1",
        userId: "u1",
        sessionToken: "token-1"
    });

    expect(ws).toEqual({
        matchId: "m1",
        userId: "u1",
        sessionToken: "token-1"
    });
});

test("handleJoin attaches player and starts battle once battle exists", async () => {
    const ws = {};

    await BattleManager.handleJoin(ws, {
        matchId: "m3",
        userId: "u3"
    });

    expect(battle.addPlayer).toHaveBeenCalledWith("u3", ws);
    expect(battle.ensurePlayerPresence).toHaveBeenCalledWith("u3");
    expect(battle.startBattle).toHaveBeenCalledTimes(1);
    expect(ws.matchId).toBe("m3");
    expect(ws.userId).toBe("u3");
    expect(ws.sessionToken).toBe("server-token");
});

test("handleJoin rejects when user has no selected character", async () => {
    loadBattleSnapshot.mockResolvedValueOnce({
        matchId: "m-no-character",
        players: [
            { userId: "u10", teamId: 1 },
            { userId: "u11", teamId: 2 }
        ],
        units: [
            { heroId: 201, playerId: "u11", team: 2 }
        ]
    });

    const ws = {
        send: jest.fn()
    };

    await BattleManager.handleJoin(ws, {
        matchId: "m-no-character",
        userId: "u10"
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(battle.addPlayer).not.toHaveBeenCalled();
    expect(battle.startBattle).not.toHaveBeenCalled();
    expect(ws.matchId).toBeUndefined();
    expect(ws.userId).toBeUndefined();
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
        type: "error",
        code: "character_not_selected",
        message: "Персонаж не выбран"
    }));
});

test("handleReconnect passes session token and rebinds socket on success", async () => {
    await BattleManager.getOrCreateBattle("m5");

    const ws = {};

    await BattleManager.handleReconnect(ws, {
        matchId: "m5",
        userId: "u5",
        sessionToken: "resume-token"
    });

    expect(battle.reconnectPlayer).toHaveBeenCalledWith(ws, "u5", "resume-token");
    expect(ws.matchId).toBe("m5");
    expect(ws.userId).toBe("u5");
});

test("handleReconnect does not bind socket when token is rejected", async () => {
    await BattleManager.getOrCreateBattle("m6");
    battle.reconnectPlayer.mockReturnValue(false);

    const ws = {};

    await BattleManager.handleReconnect(ws, {
        matchId: "m6",
        userId: "u6",
        sessionToken: "bad-token"
    });

    expect(ws.matchId).toBeUndefined();
    expect(ws.userId).toBeUndefined();
});

test("handleDisconnect ignores stale close events and passes socket through", async () => {
    await BattleManager.getOrCreateBattle("m7");

    const ws = { matchId: "m7", userId: "u7" };

    BattleManager.handleDisconnect(ws);

    expect(battle.disconnectPlayer).toHaveBeenCalledWith("u7", ws);
});

test("handleJoin keeps canonical match id unchanged", async () => {
    const ws = {};

    await BattleManager.handleJoin(ws, {
        matchId: "mm:match:m9",
        userId: "u9"
    });

    expect(loadBattleSnapshot).toHaveBeenCalledWith("mm:match:m9");
    expect(ws.matchId).toBe("mm:match:m9");
});

test("battle is removed from cache after onFinished callback", async () => {
    await BattleManager.getOrCreateBattle("m8");

    const callback = battle.onFinished.mock.calls[0][0];
    await callback();

    expect(BattleManager.getBattle({ matchId: "m8" })).toBeUndefined();
});
