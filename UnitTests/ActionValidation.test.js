import { MoveAction } from '../battles/Actions/ActionsInstance/MoveAction.js';
import { AttackAction } from '../battles/Actions/ActionsInstance/AttackAction.js';

describe('MoveAction rules validation', () => {
    test('move consumes AP by 1 AP per 2 tiles and writes event', () => {
        const unit = {
            id: 1,
            ownerId: 'u1',
            ap: 4,
            x: 0,
            y: 0
        };

        const session = {
            phase: 'TURN_START',
            players: new Map([['u1', {}]]),
            state: {
                activeUnitId: 1,
                terrain: { width: 10, height: 10 },
                getUnit: () => unit,
                getUnitByPosition: () => null,
                spendAp: (unitId, amount) => {
                    if (unitId !== 1) throw new Error('wrong unit');
                    unit.ap -= amount;
                }
            }
        };

        const action = {
            unitId: 1,
            userId: 'u1',
            position: { x: 0, y: 3 }
        };

        const eventLog = [];
        const handler = new MoveAction();

        handler.validate(session, action);
        handler.execute({ session, action, eventLog });

        expect(unit.ap).toBe(2);
        expect(eventLog[0]).toEqual({
            type: 'unit_move',
            userId: '',
            units: {
                1: {
                    position: [0, 3]
                }
            }
        });
    });

    test('move fails if target tile is occupied', () => {
        const unit = { id: 1, ownerId: 'u1', ap: 4, x: 0, y: 0 };

        const session = {
            phase: 'TURN_START',
            players: new Map([['u1', {}]]),
            state: {
                activeUnitId: 1,
                terrain: { width: 10, height: 10 },
                getUnit: () => unit,
                getUnitByPosition: () => ({ id: 2 })
            }
        };

        expect(() => {
            new MoveAction().validate(session, {
                unitId: 1,
                userId: 'u1',
                position: { x: 1, y: 0 }
            });
        }).toThrow('Target tile is occupied');
    });
});

describe('AttackAction rules validation', () => {
    test('attack consumes AP and writes event', () => {
        const attacker = {
            id: 1,
            team: 1,
            ownerId: 'u1',
            ap: 4,
            x: 0,
            y: 0
        };

        const target = {
            id: 2,
            team: 2,
            hp: 10,
            x: 1,
            y: 0
        };

        const session = {
            players: new Map([['u1', {}]]),
            state: {
                activeUnitId: 1,
                getUnit: (id) => (id === 1 ? attacker : target),
                spendAp: (unitId, amount) => {
                    if (unitId !== 1) throw new Error('wrong unit');
                    attacker.ap -= amount;
                }
            }
        };

        const action = {
            unitId: 1,
            userId: 'u1',
            targetUnitId: 2
        };

        const eventLog = [];
        const handler = new AttackAction();

        handler.validate(session, action);
        handler.execute({ session, action, eventLog });

        expect(attacker.ap).toBe(2);
        expect(eventLog[0]).toEqual({
            type: 'unit_attack',
            unitId: 1,
            target: 2
        });
    });

    test('attack fails on allied target', () => {
        const attacker = { id: 1, team: 1, ownerId: 'u1', ap: 4, x: 0, y: 0 };
        const target = { id: 2, team: 1, hp: 10, x: 1, y: 0 };

        const session = {
            players: new Map([['u1', {}]]),
            state: {
                activeUnitId: 1,
                getUnit: (id) => (id === 1 ? attacker : target)
            }
        };

        expect(() => {
            new AttackAction().validate(session, {
                unitId: 1,
                userId: 'u1',
                targetUnitId: 2
            });
        }).toThrow('Cannot attack allied unit');
    });
});
