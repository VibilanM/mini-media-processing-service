import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import cors from "cors";
import uploadRoutes from "./routers/uploadRoutes.js";
import initializeStorage from "./storage/minio.server.js";
import { redisConnect } from "./config/redis.js";
import streamRoutes from "./routers/streamRoutes.js";

dotenv.config();

connectDB();
initializeStorage();
redisConnect();

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Media Processing Service",
        status: "ok"
    });
});

app.use("/api/uploads", uploadRoutes);
app.use("/api/stream", streamRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`);
});

