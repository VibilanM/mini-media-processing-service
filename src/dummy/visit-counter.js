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

app.post("/score", async (req, res) => {
    try {
        const { name, score } = req.body;

        if (!name || score === undefined) {
            return res.status(400).json({
                message: "Name and score required."
            });
        }

        await redis.zAdd("leaderboard", [
            {
                score: Number(score),
                value: name
            },
        ]);

        res.json({
            message: "Score updated."
        });
    }
    catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get("/leaderboard", async (req, res) => {
    try {
        const leaderboard = await redis.zRangeWithScores("leaderboard", 0, -1, {
            REV: true
        });

        const result = leaderboard.map((player, index) => ({
            rank: index + 1,
            name: player.value,
            score: player.score
        }));

        res.json({
            leaderboard: result
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
