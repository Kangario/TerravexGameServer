import { CombatRules } from '../battles/CombatRules.js';
import { jest } from '@jest/globals';


const mockTerrain = {
    getHeight: jest.fn(),
    getCover: jest.fn()
};

describe('CombatRules.actionCost', () => {

    test('move стоит 1 AP на 2 тайла (округление вверх)', () => {
        const cost = CombatRules.actionCost('move', { tiles: 3 });
        expect(cost).toBe(2);
    });

    test('attack стоит 2', () => {
        expect(CombatRules.actionCost('attack')).toBe(2);
    });

    test('cast стоит 2', () => {
        expect(CombatRules.actionCost('cast')).toBe(2);
    });

    test('неизвестное действие вызывает ошибку', () => {
        expect(() => {
            CombatRules.actionCost('dance');
        }).toThrow();
    });

});

describe('CombatRules.calculateDamage', () => {

    test('базовый урон без модификаторов', () => {
        const attacker = { attack: 10, x: 0, y: 0 };
        const target = { defense: 3, x: 1, y: 1 };

        mockTerrain.getHeight.mockReturnValue(0);
        mockTerrain.getCover.mockReturnValue(0);

        const damage = CombatRules.calculateDamage({
            attacker,
            target,
            terrain: mockTerrain
        });

        expect(damage).toBe(7);
    });
    
    test('урон увеличивается при атаке сверху', () => {
        const attacker = { attack: 10, x: 0, y: 0 };
        const target = { defense: 0, x: 1, y: 1 };

        mockTerrain.getHeight
            .mockReturnValueOnce(2) // attacker
            .mockReturnValueOnce(0); // target

        mockTerrain.getCover.mockReturnValue(0);

        const damage = CombatRules.calculateDamage({
            attacker,
            target,
            terrain: mockTerrain
        });

        expect(damage).toBe(Math.floor(10 * 1.15));
    });
    
    test('урон уменьшается укрытием', () => {
        const attacker = { attack: 10, x: 0, y: 0 };
        const target = { defense: 0, x: 1, y: 1 };

        mockTerrain.getHeight.mockReturnValue(0);
        mockTerrain.getCover.mockReturnValue(0.5);

        const damage = CombatRules.calculateDamage({
            attacker,
            target,
            terrain: mockTerrain
        });

        expect(damage).toBe(5);
    });

});

describe('CombatRules.calculateHitChance', () => {

    test('базовый шанс — 0.85', () => {
        const terrain = {
            hasLineOfSight: jest.fn().mockReturnValue(true)
        };

        const chance = CombatRules.calculateHitChance({
            attacker: {},
            target: {},
            terrain
        });

        expect(chance).toBe(0.85);
    });

    test('без line of sight шанс уменьшается', () => {
        const terrain = {
            hasLineOfSight: jest.fn().mockReturnValue(false)
        };

        const chance = CombatRules.calculateHitChance({
            attacker: {},
            target: {},
            terrain
        });

        expect(chance).toBeCloseTo(0.45, 5);
    });

});

describe('CombatRules.isDead', () => {

    test('юнит мёртв при hp <= 0', () => {
        expect(CombatRules.isDead({ hp: 0 })).toBe(true);
        expect(CombatRules.isDead({ hp: -5 })).toBe(true);
    });

    test('юнит жив при hp > 0', () => {
        expect(CombatRules.isDead({ hp: 10 })).toBe(false);
    });

});



