import { Worker, UnrecoverableError } from "bullmq";
import dotenv from "dotenv";
import { processVideo } from "../processors/videoProcess.js";
import { deadLetterQueue } from "../queues/videoQueues.js";
import { classifyError } from "../utils/errors.js";
import connectDB from "../config/db.js";

dotenv.config();

await connectDB();

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId, originalKey } = job.data;

        console.log(
            `[Worker] Attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1} ` +
            `for video: ${videoId} (Job ID: ${job.id})`
        );

        try {
            await processVideo(videoId, originalKey);
            console.log(`[Worker] Finished job for video: ${videoId}`);
        }
        catch (err) {
            const errorType = classifyError(err);

            if (errorType === "permanent") {
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
            backOffStrategy: (attemptsMade) => {
                const baseDelay = 5000;
                const maxDelay = baseDelay * Math.pow(2, attemptsMade);
                const jitter = Math.floor(Math.random() * maxDelay);
                console.log(`[Worker] Backing off for ${jitter} ms before retry`);
                return jitter;
            },
        },
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
    const retriesExhausted = job.attemptsMade >= (job.opts.attempts || 1);
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

console.log(`[Worker] Video processing worker started. Waiting for jobs...`);