// battles/turn/actions/ActionFactory.js

import { MoveAction } from "./ActionsInstance/MoveAction.js";
import { AttackAction } from "./ActionsInstance/AttackAction.js";

const ACTIONS = {
    move: MoveAction,
    attack: AttackAction
};

export class ActionFactory {

    static create(type) {
        const ActionClass = ACTIONS[type];
        if (!ActionClass) {
            throw new Error(`Unknown action type: ${type}`);
        }
        return new ActionClass();
    }

    static has(type) {
        return !!ACTIONS[type];
    }
}
