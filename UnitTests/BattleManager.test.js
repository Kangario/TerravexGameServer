import { jest } from '@jest/globals';

const mockBattle = {
    addPlayer: jest.fn(),
    handleTurnActions: jest.fn(),
    reconnectPlayer: jest.fn(),
    disconnectPlayer: jest.fn(),
    onFinished: jest.fn()
};

const mockSnapshot = { state: 'snapshot' };

const loadBattleSnapshot = jest.fn().mockResolvedValue(mockSnapshot);

const BattleFactory = {
    create: jest.fn(() => mockBattle)
};

jest.unstable_mockModule('../battles/loadBattleSnapshot.js', () => ({
    loadBattleSnapshot
}));

jest.unstable_mockModule('../battles/BattleFactory.js', () => ({
    BattleFactory
}));

let BattleManager;

beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    ({ BattleManager } = await import('../battles/BattleManager.js'));
});

describe('getOrCreateBattle', () => {

    test('создаёт battle если нет', async () => {
        const battle = await BattleManager.getOrCreateBattle('m1');

        expect(loadBattleSnapshot).toHaveBeenCalledWith('m1');
        expect(BattleFactory.create).toHaveBeenCalledWith('m1', mockSnapshot);
        expect(battle).toBe(mockBattle);
    });

    test('возвращает кеш если уже создан', async () => {
        await BattleManager.getOrCreateBattle('m2');
        await BattleManager.getOrCreateBattle('m2');

        expect(loadBattleSnapshot).toHaveBeenCalledTimes(1);
    });

});

test('bindSocket пишет matchId и userId', () => {
    const ws = {};
    BattleManager.bindSocket(ws, { matchId: 'm1', userId: 'u1' });

    expect(ws.matchId).toBe('m1');
    expect(ws.userId).toBe('u1');
});

test('handleJoin добавляет игрока', async () => {
    const ws = {};
    const msg = { matchId: 'm3', userId: 'u3' };

    await BattleManager.handleJoin(ws, msg);

    expect(mockBattle.addPlayer).toHaveBeenCalledWith('u3', ws);
    expect(ws.matchId).toBe('m3');
});

test('handleReconnect вызывает reconnect', async () => {
    await BattleManager.getOrCreateBattle('m5');

    const ws = {};
    BattleManager.handleReconnect(ws, {
        matchId: 'm5',
        userId: 'u5'
    });

    expect(mockBattle.reconnectPlayer)
        .toHaveBeenCalledWith(ws, 'u5');
});

test('handleDisconnect вызывает disconnect', async () => {
    await BattleManager.getOrCreateBattle('m6');

    const ws = { matchId: 'm6', userId: 'u6' };

    BattleManager.handleDisconnect(ws);

    expect(mockBattle.disconnectPlayer)
        .toHaveBeenCalledWith('u6');
});

test('battle удаляется после onFinished', async () => {
    await BattleManager.getOrCreateBattle('m7');

    const callback = mockBattle.onFinished.mock.calls[0][0];
    callback();

    const ws = { matchId: 'm7' };

    expect(BattleManager.getBattle(ws)).toBeUndefined();
});

