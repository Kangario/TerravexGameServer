import { BaseBattleAction } from "../BaseBattleAction.js";
import { CombatRules } from "../../CombatRules.js";

export class AttackAction extends BaseBattleAction {

    validate(session, action) {
        const unitId = Number(action.unitId);
        const targetUnitId = Number(action.targetUnitId);
        const attacker = session.state.getUnit(unitId);
        const target = session.state.getUnit(targetUnitId);
        
        if (session.state.activeUnitId !== unitId) {
            throw new Error("Not active unit");
        }

        if (!attacker) {
            throw new Error("Attacker not found");
        }
        
        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }

        if (attacker.ownerId !== action.userId) {
            throw new Error("Unit does not belong to player");
        }

        if (!target || target.hp <= 0) {
            throw new Error("Target not found");
        }

        if (target.team === attacker.team) {
            throw new Error("Cannot attack allied unit");
        }

        const distance = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);

        if (distance > 1) {
            throw new Error("Target is out of attack range");
        }

        action.__apCost = CombatRules.actionCost("attack");

        if (attacker.ap < action.__apCost) {
            throw new Error("Not enough AP for attack");
        }
    }

    execute({ session, action, eventLog }) {
        const unitId = Number(action.unitId);
        const unit = session.state.getUnit(unitId);

        if (!unit) {
            throw new Error("Unit not found");
        }

        session.state.spendAp(unitId, action.__apCost);


        eventLog.push({
            type: "unit_attack",
            unitId: action.unitId,
            target: action.targetUnitId,
            unitAp: unit.ap
        });
    }
}
