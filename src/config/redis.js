import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redis = createClient({
    socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
    },
});

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