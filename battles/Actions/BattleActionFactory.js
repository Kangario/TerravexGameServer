import { DeployReadyAction } from "./ActionsInstance/DeployReadyAction.js";
import {DeployInitAction} from "./ActionsInstance/DeployInitAction.js";

const ACTIONS = {
    deploy_start: DeployInitAction,
    deploy_ready: DeployReadyAction
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
