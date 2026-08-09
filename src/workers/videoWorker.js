import { Worker } from "bullmq";
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { processVideo } from "../processors/videoProcess.js";

dotenv.config();

await connectDB();

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId, originalKey } = job.data;

        console.log(`[Worker] Picked up job for video: ${videoId}`);

        await processVideo(videoId, originalKey);

        console.log(`[Worker] Finished job for video: ${videoId}`);
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        },
        concurrency: 1,
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job.id} failed: ${err.message}`);
});