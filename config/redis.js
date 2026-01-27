import { createClient } from "redis";

export const gsRedis = createClient({
    username: "default",
    password: "o0EjuPkv0vCmo25LodqPxQMBvKDjzMpD",
    socket: { host: "redis-16597.c328.europe-west3-1.gce.cloud.redislabs.com", port: 16597 }
});

export const mmRedis = createClient({
    username: "default",
    password: "67zcdHUvuYYp23FZ4vDSDmQKJIyelSNf",
    socket: { host: "redis-16482.c328.europe-west3-1.gce.cloud.redislabs.com", port: 16482 }
});

export const userRedis = createClient({
    username: "default",
    password: "af0gO9r23iS9w7sYd8T0XtQktQR0ZXnl",
    socket: { host: "redis-17419.c328.europe-west3-1.gce.cloud.redislabs.com", port: 17419 }
});

export async function initRedis() {
    gsRedis.on("error", (err) => console.error("GS Redis error:", err));
    mmRedis.on("error", (err) => console.error("MM Redis error:", err));
    userRedis.on("error", (err) => console.error("userRedis error:", err));
    
    await gsRedis.connect();
    await mmRedis.connect();
    await userRedis.connect();
    
    console.log("✅ Connected to Redis");
}
