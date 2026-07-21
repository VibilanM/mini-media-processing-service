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

app.post("/search", async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({
                error: "Query is required."
            });
        }

        await redis.lPush("recent-searches", query);
        await redis.lTrim("recent-searches", 0, 9);

        res.json({
            message: "Search saved."
        });
    }
    catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get("/search", async (req, res) => {
    try {
        const searches = await redis.lRange("recent-searches", 0, -1);

        res.json({
            searches
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
