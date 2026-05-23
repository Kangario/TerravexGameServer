import { jest } from "@jest/globals";
import { BattleRewardClient } from "../battles/Rewards/BattleRewardClient.js";

describe("BattleRewardClient", () => {
    test("posts battle reward plan to RewardServer apply endpoint", async () => {
        const json = jest.fn().mockResolvedValue({ ok: true });
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json
        });
        const client = new BattleRewardClient({
            baseUrl: "http://rewards.local",
            fetchImpl
        });
        const reward = { killXp: [{ instanceId: "hero-1", xpDelta: 50 }] };

        await client.applyBattleReward("u1", "battle_win", { matchId: "m1" }, reward);

        expect(fetchImpl).toHaveBeenCalledWith("http://rewards.local/battle-rewards/apply", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                playerId: "u1",
                rewardType: "battle_win",
                battle: { matchId: "m1" },
                reward
            })
        });
    });
});
