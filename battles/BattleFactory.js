import { Battle } from "./Battle.js";

export const BattleFactory = {

    create(match) {
        console.log("🛠 Creating battle for match", match.id);

        const battle = new Battle(match);

        return battle;
    }

};
