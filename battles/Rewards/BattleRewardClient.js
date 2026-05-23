const DEFAULT_REWARDS_SERVER_URL = "https://terravexgamerewards-254547110109.europe-west1.run.app";

export class BattleRewardClient {
    constructor({
        baseUrl = process.env.REWARDS_SERVER_URL || DEFAULT_REWARDS_SERVER_URL,
        fetchImpl = fetch
    } = {}) {
        this.baseUrl = baseUrl;
        this.fetch = fetchImpl;
    }

    async applyBattleReward(playerId, rewardType, battle, reward) {
        const response = await this.fetch(`${this.baseUrl}/battle-rewards/apply`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                playerId,
                rewardType,
                battle,
                reward
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Rewards server returned ${response.status}: ${errorBody}`);
        }

        return response.json();
    }
}
