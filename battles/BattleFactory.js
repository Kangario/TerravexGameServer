import { BattleSession } from "./BattleSession.js";
import { TerrainGenerator } from "../GenerationTerrain/TerrainGenerator.js";
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
        return new BattleSession(snapshot);
    },

    generateSeed(match) {
        return match.seed ?? Date.now();
    },

    normalizeCharacters(characters) {
        return characters.map(c => ({
            id: c.id,
            team: c.team,
            name: c.name,
            class: c.class,
            hp: c.hp,
            maxHp: c.maxHp,
            ap: c.ap,
            initiative: c.initiative,
            damageP: c.damageP,
            damageM: c.damageM,
            defenceP: c.defenceP,
            defenceM: c.defenceM,
            speed: c.speed,
            attackSpeed: c.attackSpeed,
            position: {
                x: c.x,
                y: c.y
            }
        }));
    }
};