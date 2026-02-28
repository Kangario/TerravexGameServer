export const CombatRules = {

    // =========================
    // ACTION COSTS
    // =========================
    actionCost(actionType, context = {}) {
        switch (actionType) {
            case "move":
                return Math.max(1, Math.ceil((context.tiles ?? 0) / context.unitMoveCost));

            case "attack":
                return 2;

            case "cast":
                return 2;

            default:
                throw new Error(`Unknown action type: ${actionType}`);
        }
    },

    // =========================
    // DAMAGE
    // =========================
    calculateDamage({ attacker, target, terrain }) {
        let damage = attacker.attack - target.defense;

        // height advantage
        const heightDiff =
            terrain.getHeight(attacker.x, attacker.y) -
            terrain.getHeight(target.x, target.y);

        if (heightDiff > 0) damage *= 1.15;
        if (heightDiff < 0) damage *= 0.85;

        // cover
        const cover = terrain.getCover(target.x, target.y);
        if (cover) {
            damage *= (1 - cover); // cover = 0.25 / 0.5
        }

        return Math.max(0, Math.floor(damage));
    },

    // =========================
    // HIT CHANCE
    // =========================
    calculateHitChance({ attacker, target, terrain }) {
        let chance = 0.85;

        if (!terrain.hasLineOfSight(attacker, target)) {
            chance -= 0.4;
        }

        return Math.max(0, Math.min(1, chance));
    },

    // =========================
    // DEATH
    // =========================
    isDead(unit) {
        return unit.hp <= 0;
    }
};
