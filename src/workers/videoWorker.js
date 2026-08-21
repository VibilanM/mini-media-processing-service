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

        console.log(`[Worker] Attempt ${job.attemptsMade + 1}/${job.opts.attempts} for video: ${videoId}`);

        await processVideo(videoId, originalKey);
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        },
        concurrency: 1,
        settings: {
            backOffStrategy: (attempstsMade) => {
                const baseDelay = 5000;
                const maxDelay = baseDelay * Math.pow(2, attemptsMade);
                return Math.floor(Math.random() * maxDelay);
            },
        },
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job.id} failed: ${err.message}`);
});