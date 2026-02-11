export class BaseBattleAction {

    validate(session, action) {
        throw new Error("validate() not implemented");
    }

    execute({ session, action, eventLog }) {
        throw new Error("execute() not implemented");
    }
}
