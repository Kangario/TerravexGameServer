import { DeployReadyAction } from "./ActionsInstance/DeployReadyAction.js";
import {DeployInitAction} from "./ActionsInstance/DeployInitAction.js";
import {TurnEndAction} from "./ActionsInstance/TurnEndAction.js";
import {MoveAction} from "./ActionsInstance/MoveAction.js";
import {AttackAction} from "./ActionsInstance/AttackAction.js";

const ACTIONS = {
    deploy_start: DeployInitAction,
    deploy_ready: DeployReadyAction,
    turn_end: TurnEndAction,
    unit_move: MoveAction,
    unit_attack: AttackAction
};

export class BattleActionFactory {

    static create(type) {

        const Action = ACTIONS[type];

        if (!Action) {
            throw new Error(`Unknown battle action: ${type}`);
        }

        return new Action();
    }
}
