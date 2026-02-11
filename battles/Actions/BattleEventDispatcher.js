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

            session.advanceToTurnStart();
        },

        unit_move(session, event) {

           
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
