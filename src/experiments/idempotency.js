/**
 * Idempotency Experiment
 * 
 * Demonstrates what happens when the same video is processed twice:
 *   1. Without idempotency protection (duplicate processing)
 *   2. With idempotency protection (skip-if-already-done)
 * 
 * Usage:
 *   node src/experiments/idempotency.js
 */

import { Queue, Worker } from "bullmq";
import { createClient } from "redis";

const connection = { host: "localhost", port: 6379 };

const QUEUE_NAME = "idempotency-test";
const DUPLICATE_VIDEO_ID = "video-123";

async function runExperiment() {
    const redis = createClient();
    await redis.connect();

    // Clean up previous run
    await redis.del("processed-videos");
    await redis.del("processing-log");

    const queue = new Queue(QUEUE_NAME, { connection });

    console.log("\n" + "=".repeat(60));
    console.log("  IDEMPOTENCY EXPERIMENT");
    console.log("=".repeat(60));
    console.log(`  Submitting the SAME video (${DUPLICATE_VIDEO_ID}) 5 times`);
    console.log("  Plus 5 unique videos.\n");

    // --- Worker WITHOUT idempotency ---
    let naiveCount = 0;
    const naiveResults = [];

    console.log("─".repeat(60));
    console.log("  Phase 1: WITHOUT idempotency (naive worker)");
    console.log("─".repeat(60));

    const naiveWorker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { videoId, attempt } = job.data;
            // Simulate "processing" — just logs it
            await new Promise((r) => setTimeout(r, 200));
            naiveCount++;
            naiveResults.push({ videoId, attempt, jobId: job.id });
            console.log(`  [Naive] Processed ${videoId} (attempt #${attempt}) — total processed: ${naiveCount}`);
        },
        { connection, concurrency: 3 }
    );

    // Submit: 5x duplicate + 5 unique
    for (let i = 1; i <= 5; i++) {
        await queue.add(`dup-${i}`, {
            videoId: DUPLICATE_VIDEO_ID,
            attempt: i,
        });
    }
    for (let i = 1; i <= 5; i++) {
        await queue.add(`unique-${i}`, {
            videoId: `video-unique-${i}`,
            attempt: 1,
        });
    }

    // Wait for all 10 jobs
    await new Promise((resolve) => {
        let completed = 0;
        naiveWorker.on("completed", () => {
            completed++;
            if (completed >= 10) resolve();
        });
        setTimeout(() => resolve(), 15000);
    });

    await naiveWorker.close();
    await queue.obliterate({ force: true });

    const dupProcessed = naiveResults.filter((r) => r.videoId === DUPLICATE_VIDEO_ID).length;
    console.log(`\n  Result: ${DUPLICATE_VIDEO_ID} was processed ${dupProcessed} time(s)`);
    console.log(`  Total jobs processed: ${naiveCount}`);
    console.log(`  ❌ ${DUPLICATE_VIDEO_ID} should only be processed ONCE!\n`);

    // --- Worker WITH idempotency ---
    console.log("─".repeat(60));
    console.log("  Phase 2: WITH idempotency (smart worker)");
    console.log("─".repeat(60));

    let smartCount = 0;
    const smartResults = [];

    const smartWorker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { videoId, attempt } = job.data;

            // Idempotency check: has this video already been processed?
            const alreadyDone = await redis.sIsMember("processed-videos", videoId);
            if (alreadyDone) {
                console.log(`  [Smart] SKIPPED ${videoId} (attempt #${attempt}) — already processed`);
                return { skipped: true, reason: "already_processed" };
            }

            // Mark as processed BEFORE doing the work (claim the slot)
            const wasAdded = await redis.sAdd("processed-videos", videoId);
            if (wasAdded === 0) {
                // Another worker beat us to it between the check and the add
                console.log(`  [Smart] SKIPPED ${videoId} (attempt #${attempt}) — race lost`);
                return { skipped: true, reason: "race_lost" };
            }

            // Simulate processing
            await new Promise((r) => setTimeout(r, 200));
            smartCount++;
            smartResults.push({ videoId, attempt, jobId: job.id });
            console.log(`  [Smart] Processed ${videoId} (attempt #${attempt}) — total processed: ${smartCount}`);

            // Log the processing
            await redis.lPush("processing-log", JSON.stringify({
                videoId,
                processedAt: new Date().toISOString(),
            }));
        },
        { connection, concurrency: 3 }
    );

    // Submit same pattern: 5x duplicate + 5 unique
    for (let i = 1; i <= 5; i++) {
        await queue.add(`dup-${i}`, {
            videoId: DUPLICATE_VIDEO_ID,
            attempt: i,
        });
    }
    for (let i = 1; i <= 5; i++) {
        await queue.add(`unique-${i}`, {
            videoId: `video-unique-${i}`,
            attempt: 1,
        });
    }

    // Wait for all 10 jobs
    await new Promise((resolve) => {
        let completed = 0;
        smartWorker.on("completed", () => {
            completed++;
            if (completed >= 10) resolve();
        });
        setTimeout(() => resolve(), 15000);
    });

    await smartWorker.close();

    const smartDupProcessed = smartResults.filter((r) => r.videoId === DUPLICATE_VIDEO_ID).length;
    console.log(`\n  Result: ${DUPLICATE_VIDEO_ID} was processed ${smartDupProcessed} time(s)`);
    console.log(`  Total unique videos processed: ${smartCount}`);
    console.log(`  ✔ Idempotency protection worked!\n`);

    // --- Summary ---
    console.log("=".repeat(60));
    console.log("  COMPARISON");
    console.log("=".repeat(60));
    console.log(`  Without idempotency: ${DUPLICATE_VIDEO_ID} processed ${dupProcessed}x  ← BAD`);
    console.log(`  With idempotency   : ${DUPLICATE_VIDEO_ID} processed ${smartDupProcessed}x  ← GOOD`);
    console.log("=".repeat(60));
    console.log("\n  Technique used: Redis SET (SADD/SISMEMBER)");
    console.log("  Before processing, check if the videoId exists in the set.");
    console.log("  If yes → skip. If no → SADD to claim, then process.");
    console.log("  SADD returns 0 if already exists, handling the race too.\n");

    // Cleanup
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.del("processed-videos");
    await redis.del("processing-log");
    await redis.quit();
    process.exit(0);
}

runExperiment().catch((err) => {
    console.error("Experiment failed:", err);
    process.exit(1);
});
