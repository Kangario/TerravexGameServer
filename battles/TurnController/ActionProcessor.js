export class ActionProcessor {

    static process(battle, unit, actions) {

        const events = [];
        const state = battle.state;

        for (const act of actions) {

            if (act.type === "move") {
                ActionProcessor.move(state, unit, act, events);
            }

            if (act.type === "attack") {
                ActionProcessor.attack(state, unit, act, events);
            }
        }

        return events;
    }

    static move(state, unit, act, events) {
        const [nx, ny] = act.path.at(-1);

        events.push(battle.eventFactory.move(unit, nx, ny));

        state.UnitGrid[unit.y * state.Width + unit.x] = -1;
        unit.x = nx;
        unit.y = ny;
        state.UnitGrid[ny * state.Width + nx] = unit.UnitId;

        unit.AP--;
    }

    static attack(state, unit, act, events) {
        const target = state.Units[act.targetUnitId];
        if (!target || target.IsDead) return;

        const dmg = unit.PhysicalDamage;
        target.Hp -= dmg;

        events.push(battle.eventFactory.attack(unit, target, dmg));

        if (target.Hp <= 0)
            target.IsDead = true;
    }
}
