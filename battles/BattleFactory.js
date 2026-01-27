import { Battle } from "./Battle.js";

export const BattleFactory = {

    create(match, battleCharacters) {
        console.log("🛠 Creating battle for match", match.id);

        const battle = new Battle(match, battleCharacters);

        return battle;
    }

};
