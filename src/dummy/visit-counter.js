import { redis, redisConnect } from "../config/redis.js";
import express from "express";

const app = express();

app.use(express.json());

redisConnect();

app.get("/visits", async (req, res) => {
    try {
        const visits = await redis.incr("visits");

        res.json({
            visits: visits
        });
    }
    catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
