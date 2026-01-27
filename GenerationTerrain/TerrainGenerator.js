export function generateHeightMap(width, height, options = {}) {
    const {
        scale = 100,     
        seed = 1337,
        octaves = 4,
        persistence = 0.5,
        lacunarity = 2.0
    } = options;

    const noise = makePerlin(seed);
    const result = new Float32Array(width * height);

    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {

            let amplitude = 1;
            let frequency = 1;
            let value = 0;

            for (let o = 0; o < octaves; o++) {
                const nx = (x / width) * scale * frequency;
                const ny = (y / height) * scale * frequency;

                value += noise(nx, ny) * amplitude;

                amplitude *= persistence;
                frequency *= lacunarity;
            }

            const index = y * width + x;
            result[index] = value;

            if (value < min) min = value;
            if (value > max) max = value;
        }
    }

    // Нормализация в диапазон [0,1]
    const range = max - min;
    for (let i = 0; i < result.length; i++) {
        let normilize = (result[i] - min) / range;
        result[i] = Math.round(normilize * 99);
    }

    return result;
}

function makePerlin(seed = 1337) {
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    
    let s = seed >>> 0;
    function rand() {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s;
    }

    for (let i = 0; i < 256; i++) p[i] = i;

    for (let i = 255; i > 0; i--) {
        const j = rand() % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerp(t, a, b) {
        return a + t * (b - a);
    }

    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    return function noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = fade(x);
        const v = fade(y);

        const A = perm[X] + Y;
        const B = perm[X + 1] + Y;

        const n00 = grad(perm[A], x, y);
        const n01 = grad(perm[A + 1], x, y - 1);
        const n10 = grad(perm[B], x - 1, y);
        const n11 = grad(perm[B + 1], x - 1, y - 1);

        return lerp(v,
            lerp(u, n00, n10),
            lerp(u, n01, n11)
        );
    };
}