export const EBattlePhase = Object.freeze({
    None: 0,

    Initializing: 1,
    Deploying: 2,

    TurnStart: 3,
    PlayerPlanning: 4,
    WaitingServer: 5,
    Simulating: 6,
    TurnEnd: 7,

    Paused: 8,
    Reconnecting: 9,
    Syncing: 10,

    BattleFinished: 11
});

