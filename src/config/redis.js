import { createClient } from "redis";

const redis = createClient();

redis.on("error", (err) => {
    console.log("Redis error: ", err);
});

async function redisConnect() {
    await redis.connect();
    console.log("Redis connected");
}

async function redisDisconnect() {
    await redis.quit();
    console.log("Redis disconnected");
}

export { redis, redisConnect, redisDisconnect };