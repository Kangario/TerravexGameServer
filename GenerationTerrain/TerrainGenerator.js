// battles/terrain/TerrainGenerator.js

import { TerrainGrid } from "./TerrainGrid.js";
import { generateHeightMap } from "./heightMap.js";

export const TerrainGenerator = {

    generate({ width, height, seed }) {

        // 1️⃣ heights
        const heights = generateHeightMap(width, height, { seed });

        // 2️⃣ types (простейшее правило)
        const types = new Uint8Array(width * height);

        for (let i = 0; i < heights.length; i++) {
            const h = heights[i];

            if (h < 20) types[i] = 0;       // water
            else if (h < 40) types[i] = 1;  // sand
            else if (h < 70) types[i] = 2;  // grass
            else types[i] = 3;              // rock
        }

        return new TerrainGrid({
            width,
            height,
            heights: Array.from(heights),
            types: Array.from(types)
        });
    }
};
