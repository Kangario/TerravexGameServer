import { BattleFactory } from "../../battles/BattleFactory.js"

export function createTestBattle({
                                     matchId = "test-match",
                                     width = 8,
                                     height = 8,
                                     seed = 12345,
                                     characters = []
                                 } = {}) {

    const match = {
        id: matchId,
        mapWidth: width,
        mapHeight: height,
        seed
    }

    const battleCharacters = characters.map((c, i) => ({
        id: c.id ?? `unit-${i}`,
        team: c.team ?? 1,
        hp: c.hp ?? 100,
        ap: c.ap ?? 2,
        initiative: c.initiative ?? 10,
        attack: c.attack ?? 10,
        defense: c.defense ?? 0,
        spawnX: c.spawnX ?? i,
        spawnY: c.spawnY ?? 0
    }))

    const battle = BattleFactory.create(match, battleCharacters)

    return {
        battle,
        match,
        units: battleCharacters
    }
}
