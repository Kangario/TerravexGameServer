import {BattleActionFactory} from "./BattleActionFactory.js";

export class BattleActionProcessor {

    static process({ session, action }) {

        const instance = BattleActionFactory.create(action.type);

        instance.validate(session, action);

        const events = [];

        instance.execute({
            session,
            action,
            eventLog: events
        });

        return { events };
    }
}
