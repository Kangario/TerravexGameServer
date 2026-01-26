import { generateHeightMap } from 'GenerationTerrain/TerrainGenerator.js';

export class Battle {

    constructor(match) {
        this.matchId = match.id;
        this.players = new Map();

        this.battleVersion = 0;
        this.eventIndex = 0;

        this.state = this.createInitialState(match);
    }

    // =========================
    // СОЗДАНИЕ НАЧАЛЬНОГО STATE
    // =========================

    createInitialState(match) {
       
        const seed = Math.floor(Math.random() * 1000000);
        
        const width = 15;
        const height = 40;
        

        // --- Terrain ---
        const terrainHeights = Array.from(
            generateHeightMap(width, height, {
                scale: 10,
                seed: seed,
                octaves: 1,
                persistence: 0.5,
                lacunarity: 2.0
            })
        );
        const terrainTypes   = Array(width * height).fill(0);

        // --- Users ---
        const userStates = match.players.map((p, index) => ({
            PlayerId: p.userId,
            TeamId: index,
            Connected: true
        }));

        // --- Units ---
        let nextUnitId = 1;
        const units = {};
        const unitGrid = Array(width * height).fill(-1);

        function spawnUnit(playerId, teamId, ownerIndex, x, y) {
            const id = nextUnitId++;

            const unit = {
                UnitId: id,
                HeroInstanceId: `hero_${id}`,
                PlayerId: playerId,
                TeamId: teamId,
                OwnerPlayerIndex: ownerIndex,

                x: x,
                y: y,

                Hp: 100,
                MaxHp: 100,

                AP: 0,
                MaxAP: 4,

                PhysicalDamage: 20,
                MagicDamage: 0,

                PhysicalProtection: 5,
                MagicProtection: 2,

                Speed: 5,
                AttackSpeed: 5,

                Initiative: Math.floor(Math.random() * 20) + 1,

                Facing: 0,
                IsDead: false
            };

            units[id] = unit;
            unitGrid[y * width + x] = id;
        }

        const p0 = match.players[0].userId;
        const p1 = match.players[1].userId;

        // Спавн
        spawnUnit(p0, 0, 0, 1, 1);
        spawnUnit(p0, 0, 0, 1, 3);

        spawnUnit(p1, 1, 1, 8, 8);
        spawnUnit(p1, 1, 1, 8, 6);

        // --- Initiative ---
        const initiativeOrder = Object.values(units)
            .sort((a, b) => b.Initiative - a.Initiative)
            .map(u => u.UnitId);

        const firstUnitId = initiativeOrder[0];
        
        return {
            MatchId: match.id,
            BattleVersion: 0,
            Seed: seed,

            Width: width,
            Height: height,

            TerrainHeights: terrainHeights,
            TerrainTypes: terrainTypes,

            UserStates: userStates,

            Units: units,
            UnitGrid: unitGrid,

            InitiativeOrder: initiativeOrder,
            TurnIndex: 0,
            CurrentUnitId: firstUnitId,
            TurnNumber: 1,

            CurrentPhase: 3, // TurnStart

            bBattleFinished: false,
            WinnerTeamId: -1
        };
    }

    // =========================
    // ПОДКЛЮЧЕНИЕ И СТАРТ БОЯ
    // =========================

    addPlayer(userId, ws) {
        this.players.set(userId, ws);

        if (this.players.size === 2) {
            this.start();
        }
    }

    start() {
        const battleInit = {
            type: "battle_init",
            battleVersion: this.battleVersion,
            eventIndex: this.eventIndex,
            state: this.state
        };

        this.broadcast(battleInit);
        console.log("🚀 Battle started", this.matchId);
    }

    // =========================
    // ОБРАБОТКА ХОДА ИГРОКА
    // =========================

    handleAction(userId, msg) {

        const state = this.state;
        const unit = state.Units[msg.unitId];

        // --- Проверки ---
        if (!unit || unit.IsDead) {
            console.log("❌ Invalid unit");
            return;
        }

        if (state.CurrentUnitId !== unit.UnitId) {
            console.log("❌ Not this unit's turn");
            return;
        }

        if (unit.PlayerId !== userId) {
            console.log("❌ Player not owner");
            return;
        }

        let events = [];

        // даём AP на ход
        unit.AP = unit.MaxAP;

        // --- Действия ---
        for (const act of msg.actions) {

            // MOVE
            if (act.type === "move") {
                const last = act.path[act.path.length - 1];
                const nx = last[0];
                const ny = last[1];

                events.push(this.makeEvent(0, {
                    UnitId: unit.UnitId,
                    FromX: unit.x,
                    FromY: unit.y,
                    ToX: nx,
                    ToY: ny
                }));

                state.UnitGrid[unit.y * state.Width + unit.x] = -1;
                unit.x = nx;
                unit.y = ny;
                state.UnitGrid[ny * state.Width + nx] = unit.UnitId;

                unit.AP -= 1;
            }

            // ATTACK
            if (act.type === "attack") {
                const target = state.Units[act.targetUnitId];
                if (!target || target.IsDead) continue;

                events.push(this.makeEvent(1, {
                    UnitId: unit.UnitId,
                    TargetUnitId: target.UnitId
                }));

                const damage = unit.PhysicalDamage;
                target.Hp -= damage;

                events.push(this.makeEvent(2, {
                    UnitId: target.UnitId,
                    Value: damage
                }));

                if (target.Hp <= 0) {
                    target.IsDead = true;

                    events.push(this.makeEvent(6, {
                        UnitId: target.UnitId
                    }));
                }

                unit.AP -= 2;
            }
        }

        // --- Следующий ход ---
        state.TurnIndex++;
        const nextIndex = state.TurnIndex % state.InitiativeOrder.length;
        const nextUnitId = state.InitiativeOrder[nextIndex];

        state.CurrentUnitId = nextUnitId;
        state.TurnNumber++;

        const nextUnit = state.Units[nextUnitId];

        events.push(this.makeEvent(4, {   // TurnStart
            UnitId: nextUnitId,
            Value: nextUnit.MaxAP
        }));

        // --- Версии ---
        this.battleVersion++;

        // --- Отправка ---
        this.broadcast({
            type: "turn_result",
            battleVersion: this.battleVersion,
            eventIndex: this.eventIndex,
            events: events,
            statePatch: {
                CurrentUnitId: nextUnitId,
                TurnIndex: state.TurnIndex,
                TurnNumber: state.TurnNumber,
                CurrentPhase: 3
            }
        });
    }

    // =========================
    // EVENT FACTORY
    // =========================

    makeEvent(type, data) {
        return {
            EventIndex: ++this.eventIndex,
            Type: type,
            UnitId: data.UnitId ?? -1,
            TargetUnitId: data.TargetUnitId ?? -1,
            FromX: data.FromX ?? -1,
            FromY: data.FromY ?? -1,
            ToX: data.ToX ?? -1,
            ToY: data.ToY ?? -1,
            Value: data.Value ?? 0,
            Extra: data.Extra ?? 0
        };
    }

    // =========================
    // NETWORK
    // =========================

    handleReconnect(ws, userId) {
        this.players.set(userId, ws);

        ws.send(JSON.stringify({
            type: "battle_init",
            battleVersion: this.battleVersion,
            eventIndex: this.eventIndex,
            state: this.state
        }));
    }

    handleDisconnect(userId) {
        this.players.delete(userId);
        console.log("🔴 Player left battle", userId);
    }

    broadcast(msg) {
        const json = JSON.stringify(msg);
        for (const ws of this.players.values()) {
            ws.send(json);
        }
    }
}
