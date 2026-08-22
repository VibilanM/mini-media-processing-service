import { Worker } from "bullmq";
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { processVideo } from "../processors/videoProcess.js";
import { classifyError } from "../utils/errors.js";
import { UnrecoverableError } from "bullmq";
import { videoQueue, deadLetterQueue } from "../queues/videoQueues.js";

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

worker.on("failed", async (job, err) => {
    const retriesExhausted = job.attemptsMade >= job.opts.attempts;
    const isPoisonJob = err.name === "UnrecoverableError";

    if (retriesExhausted || isPoisonJob) {
        console.error(`[Worker] Job ${job.id} permanently failed. Moving to DLQ.`);

        await deadLetterQueue.add("dead-letter", {
            originalJobId: job.id,
            originalJobData: job.data,
            failedAt: new Date().toISOString(),
            attemptsMade: job.attemptsMade,
            error: err.message,
            errorStack: err.stack,
            isPoisonJob,
        });

        console.error(`[DLQ] Job ${job.id} stored in Dead Letter Queue`);
    }
    else {
        console.warn(`[Worker] Job ${job.id} failed. Attemp ${job.attemptsMade}/${job.opts.attempts}. Will retry.`);
    }
});