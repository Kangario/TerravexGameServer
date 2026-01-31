// battles/turn/actions/AttackAction.js

import { BaseAction } from "../ActionHandler.js";

export class AttackAction extends BaseAction {

    getCost() {
        return 2;
    }

    validate(state, action) {
        const target = state.getUnit(action.targetId);
        if (!target) {
            throw new Error("AttackAction: target not found");
        }

        // позже:
        // - LOS
        // - range
        // - friendly fire
    }

    execute({ state, action, eventLog }) {
        const attacker = state.getActiveUnit();
        const target = state.getUnit(action.targetId);

        attacker.ap -= 2;

        const damage = Math.max(
            0,
            attacker.attack - target.defense
        );

        state.applyDamage(target.id, damage);

        eventLog.push({
            type: "attack",
            from: attacker.id,
            to: target.id,
            damage
        });
    }
}
