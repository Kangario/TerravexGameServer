// battles/turn/actions/BaseAction.js

export class BaseAction {

    getCost(state, action) {
        throw new Error("getCost() not implemented");
    }

    validate(state, action) {
        throw new Error("validate() not implemented");
    }

    execute({ state, action, eventLog }) {
        throw new Error("execute() not implemented");
    }
}
