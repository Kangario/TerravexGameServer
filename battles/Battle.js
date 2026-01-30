export class Battle {

    constructor(match, characters) {

        this.players = new Map();
        this.battleVersion = 0;
        this.eventIndex = 0;

        this.state = new BattleState(createInitialState(match, characters));

        this.phase = new BattlePhaseController(this);
        this.turns = new TurnController(this);
        this.events = new EventFactory(this);
        this.broadcast = new BattleBroadcaster(this).send;
    }

    start() {
        this.phase.setPhase(EBattlePhase.Initializing);
        this.broadcast({ type: "battle_init", state: this.state });
        this.turns.beginTurn();
    }

    handleAction(userId, msg) {

        const error = BattleValidator.canAct(this, userId, msg.unitId);
        if (error) return;

        const unit = this.state.getCurrentUnit();
        const events = ActionProcessor.process(this, unit, msg.actions);

        this.phase.setPhase(EBattlePhase.Simulating);
        this.broadcast({ type: "turn_result", events });

        this.turns.endTurn();
    }
}
