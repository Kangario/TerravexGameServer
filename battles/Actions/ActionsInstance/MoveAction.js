// battles/turn/actions/MoveAction.js

import { BaseAction } from "../ActionHandler.js";

export class MoveAction extends BaseAction {

    getCost(state, action) {
        // 1 AP = 1 tile (пример)
        return action.path.length;
    }

    validate(state, action) {
        if (!Array.isArray(action.path) || action.path.length === 0) {
            throw new Error("MoveAction: invalid path");
        }

        // здесь позже:
        // - проверка коллизий
        // - terrain cost
        // - bounds
    }

    execute({ state, action, eventLog }) {
        const unit = state.getActiveUnit();

        for (const [x, y] of action.path) {
            unit.ap -= 1;
            state.moveUnit(unit.id, x, y);

            eventLog.push({
                type: "move",
                unitId: unit.id,
                x,
                y
            });
        }
    }
}
