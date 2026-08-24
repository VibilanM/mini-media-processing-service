/**
 * Stress Test Worker
 * 
 * A worker with identity tracking for Module 12 concurrency experiments.
 * 
 * Launch with:
 *   $env:WORKER_ID="1"; node src/experiments/stressWorker.js
 *   $env:WORKER_ID="2"; node src/experiments/stressWorker.js
 *   ...etc
 */

import { Worker } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

const WORKER_ID = process.env.WORKER_ID || "unknown";
const PROCESSING_DELAY_MS = parseInt(process.env.PROCESSING_DELAY_MS || "2000", 10);

// --- Job tracking ---
let jobsProcessed = 0;
const jobLog = [];
const startTime = Date.now();

const worker = new Worker(
    "stress-test",
    async (job) => {
        const jobStart = Date.now();

        console.log(
            `[Worker ${WORKER_ID}] ▶ Processing job ${job.id} ` +
            `(#${job.data.jobNumber}) — jobs so far: ${jobsProcessed + 1}`
        );

        // Simulate processing with a configurable delay
        const delay = job.data.delayMs || PROCESSING_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));

        jobsProcessed++;
        const elapsed = Date.now() - jobStart;

        jobLog.push({
            jobId: job.id,
            jobNumber: job.data.jobNumber,
            processingTime: elapsed,
            timestamp: new Date().toISOString(),
        });

        console.log(
            `[Worker ${WORKER_ID}] ✔ Finished job ${job.id} ` +
            `(#${job.data.jobNumber}) in ${elapsed}ms — total: ${jobsProcessed}`
        );
    },
    {
        connection: {
            host: "localhost",
            port: 6379,
        },
        concurrency: 1,
    }
);

worker.on("completed", (job) => {
    // Logged inside the processor above
});

worker.on("failed", (job, err) => {
    console.error(`[Worker ${WORKER_ID}] ✖ Job ${job.id} failed: ${err.message}`);
});

// --- Graceful shutdown with summary ---
function printSummary() {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  Worker ${WORKER_ID} — Final Summary`);
    console.log(`${"=".repeat(50)}`);
    console.log(`  Jobs processed : ${jobsProcessed}`);
    console.log(`  Uptime         : ${totalTime}s`);
    if (jobLog.length > 0) {
        const avgTime = (
            jobLog.reduce((sum, j) => sum + j.processingTime, 0) / jobLog.length
        ).toFixed(0);
        console.log(`  Avg job time   : ${avgTime}ms`);
    }
    console.log(`${"=".repeat(50)}\n`);
}

async function shutdown() {
    console.log(`\n[Worker ${WORKER_ID}] Shutting down...`);
    await worker.close();
    printSummary();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[Worker ${WORKER_ID}] Started. Delay: ${PROCESSING_DELAY_MS}ms. Waiting for jobs on "stress-test" queue...`);
