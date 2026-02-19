// BattleEventDispatcher.js

export class BattleEventDispatcher {

    static handlers = {

        DEPLOYMENT(session, event) {

            if (session.phase !== "INIT") return [];

            session.phase = "DEPLOYMENT";
            session.deployment.readyPlayers.clear();

            if (!session.timer) {

                session.timer = setTimeout(() => {

                    session.applyEvents([
                        { type: "deployment_end" }
                    ]);

                }, event.duration);
            }

            return [];
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
                }
            }

            if (session.deployment.readyPlayers.size === session.players.size) {

                session.phase = "TURN_START";

                return [{
                    type: "deployment_end",
                    userId: event.userId,
                    units: buildUnitsPositionMap(session.state.units)
                }];
            }

            return [];
        },

        deployment_end(session, event) {

            clearTimeout(session.timer);

            return [{
                type: "turn_start",
                duration: 40000,
                activeUnitId: session.state.activeUnitId,
                initiative: session.state.initiativeQueue,
                units: buildUnitsPositionMap(session.state.units)
            }];
        },

        turn_start(session, event) {
            console.log("START TURN CALLED",
                session.state.activeUnitId,
                session.state.initiativeQueue);
            session.state.startTurn();
            return [];
        },

        turn_end(session, event) {

            session.state.endTurn();
            
            return [{
                type: "turn_start",
                duration: 40000,
                activeUnitId: session.state.activeUnitId,
                initiative: session.state.initiativeQueue,
                units: buildUnitsPositionMap(session.state.units)
            }];
        },

        unit_move(session, event) {
            for (const [unitId, data] of Object.entries(event.units)) {

                session.state.moveUnit(
                    unitId,
                    data.position[0],
                    data.position[1]
                );
            }

            return [];
        },

        unit_attack(session, event) {

            if (!session.state.isAlive(event.target)) return [];

            session.state.applyDamage(
                event.unitId,
                event.target
            );

            return [];
        }
    };

    static apply(session, event) {

        const handler = this.handlers[event.type];

        if (!handler)
            throw new Error(`[BattleEventDispatcher] Unknown event: ${event.type}`);

        return handler(session, event) || [];
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


