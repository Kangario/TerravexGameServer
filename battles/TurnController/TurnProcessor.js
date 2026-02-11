// battles/turn/TurnProcessor.js

import { BattleActionFactory } from "../Actions/BattleActionFactory.js";

export class TurnProcessor {

    static process({ state, actions }) {
        const eventLog = [];

        // 1️⃣ валидация всего хода
        this.validateTurn(state, actions);

        // 2️⃣ выполнение
        for (const action of actions) {
            const handler = BattleActionFactory.create(action.type);
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
            const handler = BattleActionFactory.create(action.type);

        }
    }
}
