import { BaseBattleAction } from "../BaseBattleAction.js";
import { CombatRules } from "../../CombatRules.js";

export class MoveAction extends BaseBattleAction {

    validate(session, action) {

        const unitId = Number(action.unitId);
        const targetX = Number(action.position?.x);
        const targetY = Number(action.position?.y);
        const unit = session.state.getUnit(unitId);

        if (session.phase === "TURN_START"){
            
        if (session.state.activeUnitId !== unitId) {
            throw new Error("Not active unit");
        }
        }

        if (!unit) {
            throw new Error("Unit not found");
        }
        
        if (!session.players.has(action.userId)) {
            throw new Error("Player not in match");
        }

        if (unit.ownerId !== action.userId) {
            throw new Error("Unit does not belong to player");
        }

        if (!Number.isInteger(targetX) || !Number.isInteger(targetY)) {
            throw new Error("Invalid move position");
        }

        const terrain = session.state.terrain;

        if (terrain) {
            const outOfBounds =
                targetX < 0 ||
                targetY < 0 ||
                targetX >= terrain.width ||
                targetY >= terrain.height;

            if (outOfBounds) {
                throw new Error("Target tile out of map bounds");
            }
        }

        const occupied = session.state.getUnitByPosition(targetX, targetY);

        if (occupied && occupied.id !== unitId) {
            throw new Error("Target tile is occupied");
        }

        const distance = Math.abs(unit.x - targetX) + Math.abs(unit.y - targetY);

        if (distance === 0) {
            throw new Error("Move must change position");
        }

        action.__apCost = CombatRules.actionCost("move", { tiles: distance });

        if (unit.ap < action.__apCost) {
            throw new Error("Not enough AP for move");
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
            type: "unit_move",
            userId: "",
            units: {
                [action.unitId]: {
                    position: [
                        action.position.x,
                        action.position.y
                    ]
                }
            },
            unitAp: unit.ap
            
        });
    }
}
