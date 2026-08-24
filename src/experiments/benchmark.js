/**
 * Concurrency Benchmark
 * 
 * Automatically runs the stress test with 1, 2, and 5 workers IN-PROCESS
 * and compares total processing time.
 * 
 * Usage:
 *   node src/experiments/benchmark.js
 *   node src/experiments/benchmark.js --jobs 50 --delay 1000
 */

import { Queue, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const JOB_COUNT = parseInt(getArg("jobs", "100"), 10);
const DELAY_MS = parseInt(getArg("delay", "2000"), 10);

async function runBenchmark(workerCount) {
    const queueName = `benchmark-${workerCount}w`;
    const queue = new Queue(queueName, { connection });

    // Clean slate
    await queue.obliterate({ force: true });

    // Track per-worker job counts
    const workerJobCounts = {};
    for (let i = 1; i <= workerCount; i++) {
        workerJobCounts[i] = 0;
    }

    // Create workers
    const workers = [];
    for (let w = 1; w <= workerCount; w++) {
        const wId = w;
        const worker = new Worker(
            queueName,
            async (job) => {
                await new Promise((r) => setTimeout(r, job.data.delayMs));
                workerJobCounts[wId]++;
            },
            { connection, concurrency: 1 }
        );
        workers.push(worker);
    }

    // Add jobs
    for (let i = 1; i <= JOB_COUNT; i++) {
        await queue.add(`job-${i}`, { jobNumber: i, delayMs: DELAY_MS });
    }

    // Measure
    const start = Date.now();

    await new Promise((resolve) => {
        let completed = 0;
        workers.forEach((w) => {
            w.on("completed", () => {
                completed++;
                if (completed % 20 === 0) {
                    process.stdout.write(`    ${completed}/${JOB_COUNT} done...\r`);
                }
                if (completed >= JOB_COUNT) resolve();
            });
        });
        // Safety timeout: 5 minutes
        setTimeout(() => resolve(), 300000);
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // Cleanup
    for (const w of workers) await w.close();
    await queue.obliterate({ force: true });
    await queue.close();

    return { workerCount, elapsed, workerJobCounts };
}

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("  CONCURRENCY BENCHMARK");
    console.log("=".repeat(60));
    console.log(`  Jobs: ${JOB_COUNT}  |  Delay per job: ${DELAY_MS}ms`);
    console.log(`  Theoretical minimum (1 worker): ${((JOB_COUNT * DELAY_MS) / 1000).toFixed(0)}s`);
    console.log("=".repeat(60) + "\n");

    const results = [];

    for (const workerCount of [1, 2, 5]) {
        console.log(`  ▶ Running with ${workerCount} worker(s)...`);
        const result = await runBenchmark(workerCount);
        results.push(result);
        console.log(`    ✔ ${workerCount} worker(s) → ${result.elapsed}s`);

        // Distribution
        const dist = Object.entries(result.workerJobCounts)
            .map(([id, count]) => `W${id}:${count}`)
            .join("  ");
        console.log(`    Distribution: ${dist}\n`);
    }

    // Summary table
    console.log("=".repeat(60));
    console.log("  RESULTS SUMMARY");
    console.log("=".repeat(60));
    console.log("  Workers  |  Time     |  Speedup");
    console.log("  " + "-".repeat(40));
    const baseline = parseFloat(results[0].elapsed);
    for (const r of results) {
        const speedup = (baseline / parseFloat(r.elapsed)).toFixed(2);
        console.log(`  ${String(r.workerCount).padEnd(9)}|  ${r.elapsed.padEnd(10)}|  ${speedup}x`);
    }
    console.log("=".repeat(60));
    console.log("\n  Notice: Speedup is NOT perfectly linear due to:");
    console.log("  - Queue overhead (locking, message delivery)");
    console.log("  - Redis round-trip latency");
    console.log("  - Job pickup contention between workers");
    console.log("  This is expected real-world behavior.\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
});
