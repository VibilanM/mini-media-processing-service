/**
 * Race Condition Experiment
 * 
 * Demonstrates:
 *   1. BROKEN: Non-atomic read-then-write (race condition)
 *   2. FIXED:  Atomic INCR (no race condition)
 * 
 * Usage:
 *   node src/experiments/raceCondition.js           # Runs both experiments
 *   node src/experiments/raceCondition.js --broken   # Only the broken version
 *   node src/experiments/raceCondition.js --fixed     # Only the fixed version
 */

import { Queue, Worker } from "bullmq";
import { createClient } from "redis";

const connection = { host: "localhost", port: 6379 };

const JOB_COUNT = 100;
const QUEUE_BROKEN = "race-broken";
const QUEUE_FIXED = "race-fixed";

async function runBrokenExperiment() {
    console.log("\n" + "=".repeat(60));
    console.log("  EXPERIMENT 1: Non-Atomic Read-Then-Write (BROKEN)");
    console.log("=".repeat(60));
    console.log("  Each job does:  GET counter → parse → SET counter+1");
    console.log("  With concurrency, multiple workers read the SAME value");
    console.log("  before any of them write, causing lost updates.\n");

    const redis = createClient();
    await redis.connect();
    await redis.set("broken-counter", "0");

    const queue = new Queue(QUEUE_BROKEN, { connection });

    // Create 5 workers with concurrency 5 each = 25 concurrent processors
    const workers = [];
    for (let w = 1; w <= 5; w++) {
        const worker = new Worker(
            QUEUE_BROKEN,
            async (job) => {
                // ⚠️ THE BUG: read, compute, write is NOT atomic
                const current = await redis.get("broken-counter");
                const newValue = parseInt(current, 10) + 1;
                // Small artificial delay to widen the race window
                await new Promise((r) => setTimeout(r, Math.random() * 10));
                await redis.set("broken-counter", String(newValue));
            },
            { connection, concurrency: 5 }
        );
        workers.push(worker);
    }

    // Add jobs
    for (let i = 1; i <= JOB_COUNT; i++) {
        await queue.add(`broken-${i}`, { jobNumber: i });
    }

    // Wait for completion
    await new Promise((resolve) => {
        let completed = 0;
        workers.forEach((w) => {
            w.on("completed", () => {
                completed++;
                if (completed >= JOB_COUNT) resolve();
            });
        });
        // Safety timeout
        setTimeout(() => resolve(), 30000);
    });

    const finalValue = await redis.get("broken-counter");
    console.log(`  Expected counter : ${JOB_COUNT}`);
    console.log(`  Actual counter   : ${finalValue}`);
    if (parseInt(finalValue, 10) < JOB_COUNT) {
        console.log(`  ❌ RACE CONDITION! Lost ${JOB_COUNT - parseInt(finalValue, 10)} increments`);
    } else {
        console.log(`  ✔ No race condition observed this time (try again — it's non-deterministic)`);
    }

    // Cleanup
    for (const w of workers) await w.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
}

async function runFixedExperiment() {
    console.log("\n" + "=".repeat(60));
    console.log("  EXPERIMENT 2: Atomic INCR (FIXED)");
    console.log("=".repeat(60));
    console.log("  Each job does:  INCR counter  (single atomic operation)");
    console.log("  Redis guarantees INCR is atomic — no lost updates.\n");

    const redis = createClient();
    await redis.connect();
    await redis.set("fixed-counter", "0");

    const queue = new Queue(QUEUE_FIXED, { connection });

    // Create 5 workers with concurrency 5 each
    const workers = [];
    for (let w = 1; w <= 5; w++) {
        const worker = new Worker(
            QUEUE_FIXED,
            async (job) => {
                // ✔ ATOMIC: single Redis command, no read-modify-write race
                await redis.incr("fixed-counter");
            },
            { connection, concurrency: 5 }
        );
        workers.push(worker);
    }

    // Add jobs
    for (let i = 1; i <= JOB_COUNT; i++) {
        await queue.add(`fixed-${i}`, { jobNumber: i });
    }

    // Wait for completion
    await new Promise((resolve) => {
        let completed = 0;
        workers.forEach((w) => {
            w.on("completed", () => {
                completed++;
                if (completed >= JOB_COUNT) resolve();
            });
        });
        setTimeout(() => resolve(), 30000);
    });

    const finalValue = await redis.get("fixed-counter");
    console.log(`  Expected counter : ${JOB_COUNT}`);
    console.log(`  Actual counter   : ${finalValue}`);
    if (parseInt(finalValue, 10) === JOB_COUNT) {
        console.log(`  ✔ PERFECT! Atomic INCR guarantees correctness`);
    } else {
        console.log(`  ❌ Unexpected — this shouldn't happen with INCR`);
    }

    // Cleanup
    for (const w of workers) await w.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
}

// --- Main ---
const args = process.argv.slice(2);
const runBroken = args.includes("--broken") || args.length === 0;
const runFixed = args.includes("--fixed") || args.length === 0;

try {
    if (runBroken) await runBrokenExperiment();
    if (runFixed) await runFixedExperiment();

    if (runBroken && runFixed) {
        console.log("\n" + "=".repeat(60));
        console.log("  COMPARISON");
        console.log("=".repeat(60));
        console.log("  Broken (GET/SET) : counter < 100  (lost updates)");
        console.log("  Fixed  (INCR)    : counter = 100  (always correct)");
        console.log("=".repeat(60));
        console.log("\n  Takeaway: Never do read-modify-write across multiple");
        console.log("  commands when concurrent access is possible.");
        console.log("  Use atomic operations (INCR, HINCRBY, Lua scripts).\n");
    }
} catch (err) {
    console.error("Experiment failed:", err);
}

process.exit(0);
