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

            for (const [unitId, data] of Object.entries(event.units)) {

                const id = Number(unitId);
                
                const unit = session.state.getUnit(id);
                if (!unit) continue;
                if (unit.ownerId === event.userId) {
                    const [x, y] = data.position;

                    unit.x = x;
                    unit.y = y;

                    console.warn("[deployment_player_ready]", unit.x, unit.y);
                }
            }
            if (session.deployment.readyPlayers.size === session.players.size) {
                
                session.applyEvents([{
                    type: "deployment_end",
                    userId: event.userId,
                    units: buildUnitsPositionMap(session.state.units)
                }]);

                session.phase = "TURN_START";
            }
        },

        deployment_end(session, event) {

            session.phase = "TURN_START";
            clearTimeout(session.timer);
            
            session.applyEvents([{
                type: "turn_start",
                duration: 40000,
                activeUnitId: session.state.activeUnitId,
                initiative: session.state.initiativeQueue,
                units: buildUnitsPositionMap(session.state.units)
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

function buildUnitsPositionMap(unitsMap) {

    const result = {};

    for (const [unitId, unit] of unitsMap) {
        result[unitId] = {
            position: [unit.x, unit.y]
        };
    }

    return result;
}


