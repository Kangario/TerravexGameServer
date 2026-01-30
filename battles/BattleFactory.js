import { Battle } from "./Battle.js";
import { TerrainGenerator } from "./terrain/TerrainGenerator.js";
import { BattleSnapshot } from "./BattleSnapshot.js";

export const BattleFactory = {

    create(match, battleCharacters) {
        console.log("🛠 Creating battle for match", match.id);
        
        const seed = this.generateSeed(match);
        
        const terrain = TerrainGenerator.generate({
            seed,
            width: match.mapWidth,
            height: match.mapHeight
        });
        
        const snapshot = BattleSnapshot.create({
            matchId: match.id,
            seed,
            terrain,
            units: this.normalizeCharacters(battleCharacters)
        });

        // 4️⃣ battle session
        return new Battle(snapshot);
    },

    generateSeed(match) {
        return match.seed ?? Date.now();
    },

    normalizeCharacters(characters) {
        return characters.map(c => ({
            id: c.id,
            team: c.team,
            stats: {
                hp: c.hp,
                ap: c.ap,
                initiative: c.initiative,
                attack: c.attack,
                defense: c.defense
            },
            position: {
                x: c.spawnX,
                y: c.spawnY
            }
        }));
    }
};