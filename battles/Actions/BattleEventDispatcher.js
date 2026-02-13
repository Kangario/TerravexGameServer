// BattleEventDispatcher.js

export class BattleEventDispatcher {

    static handlers = {

        DEPLOYMENT(session, event) {
            if (session.phase !== "INIT") return;

            session.phase = "DEPLOYMENT";

            session.deployment.readyPlayers.clear();

            if (!session.timer) {

                session.timer = setTimeout(() => {

                    session.applyEvents([
                        { type: "deployment_end" }
                    ]);

                }, event.duration);
            }
        },
        
        deployment_player_ready(session, event) {
            session.deployment.readyPlayers.add(event.userId);
        },

        deployment_end(session, event) {

            session.phase = "TURN_START";
            clearTimeout(session.timer);
            session.applyEvents([{
                type: "turn_start"
            }]);
            
        },

        turn_start(session, event) {

            console.log("Awaiting player");
            session.state.startTurn();
        },

        turn_end(session, event) {

            console.log("turn_end player");
            session.state.endTurn();
        },

        unit_move(session, event) {

            console.log("unit_move player");

            session.state.moveUnit(
                event.unitId,
                event.position[0],
                event.position[1]
            );
        },

        unit_attack(session, event) {

            console.log("unit_attack player");
            if (!session.state.isAlive(event.target)) return;
            session.state.applyDamage(
                event.unitId,
                event.target
            );
        }

    };

    static apply(session, event) {

        const handler = this.handlers[event.type];

        if (!handler) {
            throw new Error(`[BattleEventDispatcher] Unknown event: ${event.type}`);
        }

        handler(session, event);
    }

}
