import { gsRedis, userRedis  } from "../config/redis.js";
import { BattleFactory } from "./BattleFactory.js";

const activeBattles = new Map(); // matchId -> Battle

export const BattleManager = {

    async handleJoin(ws, msg) {
        const { matchId, userId } = msg;

        const matchKey = `gs:match:${matchId}`;
        const matchData = await gsRedis.get(matchKey);

        if (!matchData) {
            ws.send(JSON.stringify({ type: "error", message: "match not found" }));
            return;
        }

        const match = JSON.parse(matchData);

        let battle = activeBattles.get(match.id);

        if (!battle) {
            const battleCharacters = await loadBattleCharacters(match);
            
            battle = BattleFactory.create(match, battleCharacters);
            activeBattles.set(match.id, battle);
        }

        battle.addPlayer(userId, ws);

        ws.matchId = match.id;
        ws.userId = userId;
    },

    handleAction(ws, msg) {
        const battle = activeBattles.get(ws.matchId);
        if (!battle) return;

        battle.handleAction(ws.userId, msg);
    },

    handleReconnect(ws, msg) {
        const battle = activeBattles.get(msg.matchId);
        if (!battle) return;

        battle.handleReconnect(ws, msg.userId, msg.battleVersion);
    },

    handleDisconnect(ws) {
        const battle = activeBattles.get(ws.matchId);
        if (!battle) return;

        battle.handleDisconnect(ws.userId);
    }
};

async function loadBattleCharacters(match) {

    const result = [];

    for (const p of match.players) {

        const raw = await userRedis.get(`user:${p.userId}`);
        if (!raw) throw new Error("User not found " + p.userId);

        const user = JSON.parse(raw);

        if (!user.equipmentHeroes || user.equipmentHeroes.length === 0) {
            throw new Error("User has no equipped heroes " + p.userId);
        }

        // 🔹 Берём ВСЕХ экипированных героев игрока
        for (const hero of user.equipmentHeroes) {

            const battleCharacter = {
                PlayerId: user.userId,
                Username: user.username,

                HeroInstanceId: hero.InstanceId,
                HeroId: hero.Id,
                Name: hero.Name,
                TypeClass: hero.TypeClass,

                Level: hero.Lvl,
                Xp: hero.Xp,

                MaxHp: hero.Hp,
                Hp: hero.Hp,

                PhysicalDamage: hero.DamageP,
                MagicDamage: hero.DamageM,

                PhysicalProtection: hero.DefenceP,
                MagicProtection: hero.DefenceM,

                Speed: hero.Speed,
                AttackSpeed: hero.AttackSpeed
            };

            result.push(battleCharacter);
        }
    }

    return result;
}