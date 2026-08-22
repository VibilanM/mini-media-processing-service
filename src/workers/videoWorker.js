import { Worker } from "bullmq";
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { processVideo } from "../processors/videoProcess.js";
import { classifyError } from "../utils/errors.js";
import { UnrecoverableError } from "bullmq";

dotenv.config();

await connectDB();

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId, originalKey } = job.data;

        try {
            await processVideo(videoId, originalKey);
        }
        catch (err) {
            const errorType = classifyError(err);

            if (errorType == "permanent") {
                console.error(`[Worker] POISON JOB detected for ${videoId}: ${err.message}`);
                throw new UnrecoverableError(err.message);
            }

            console.warn(`[Worker] Transient failure for ${videoId}, will retry: ${err.message}`);
            throw err;
        }
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