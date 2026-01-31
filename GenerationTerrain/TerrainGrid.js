// battles/terrain/TerrainGrid.js

export class TerrainGrid {

    constructor({ width, height, heights, types }) {
        this.width = width;
        this.height = height;
        this.heights = heights; // Int array
        this.types = types;     // Enum / int array
        
    }

    index(x, y) {
        return y * this.width + x;
    }

    getHeight(x, y) {
        return this.heights[this.index(x, y)];
    }

    getType(x, y) {
        return this.types[this.index(x, y)];
    }

    // позже можно добавить:
    // getCover(x,y)
    // getWalkCost(x,y)
}
