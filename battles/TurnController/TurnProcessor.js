// battles/turn/TurnProcessor.js

import { ActionFactory } from "../Actions/ActionFactory.js";

export class TurnProcessor {

    static process({ state, actions }) {
        const eventLog = [];

        // 1️⃣ валидация всего хода
        this.validateTurn(state, actions);

        // 2️⃣ выполнение
        for (const action of actions) {
            const handler = ActionFactory.create(action.type);
            handler.execute({
                state,
                action,
                eventLog
            });
        }

        return { events: eventLog };
    }

    // =========================
    // VALIDATION
    // =========================
    static validateTurn(state, actions) {
        const unit = state.getActiveUnit();

        if (!unit) {
            throw new Error("No active unit");
        }

        let apLeft = unit.ap;

        for (const action of actions) {
            const handler = ActionFactory.create(action.type);
            const cost = handler.getCost(state, action);

            if (apLeft < cost) {
                throw new Error("Not enough AP");
            }

            handler.validate(state, action);
            apLeft -= cost;
        }
    }
}
