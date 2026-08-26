import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import cors from "cors";
import uploadRoutes from "./routers/uploadRoutes.js";
import initializeStorage from "./storage/minio.server.js";
import { redisConnect, redis } from "./config/redis.js";
import streamRoutes from "./routers/streamRoutes.js";
import authRoutes from "./routers/authRoutes.js";
import videoRoutes from "./routers/videoRoutes.js";
import mongoose from "mongoose";
import minioClient from "./storage/minio.client.js";

dotenv.config();

connectDB();
initializeStorage();
redisConnect();

const app = express();

app.use(express.json());
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
}));

// ── Health Checks ──

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.get("/health/ready", async (req, res) => {
    const checks = {};

    // MongoDB
    try {
        checks.mongodb = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    } catch {
        checks.mongodb = "error";
    }

    // Redis
    try {
        await redis.ping();
        checks.redis = "connected";
    } catch {
        checks.redis = "error";
    }

    // MinIO
    try {
        await minioClient.bucketExists(process.env.MINIO_BUCKET);
        checks.minio = "connected";
    } catch {
        checks.minio = "error";
    }

    const allHealthy = Object.values(checks).every((v) => v === "connected");

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? "ready" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
    });
});

// ── Root ──

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Media Processing Service",
        status: "ok"
    });
});

// ── Routes ──

app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/stream", streamRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`);
});
