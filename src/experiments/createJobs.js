/**
 * Job Producer — Create 100 fake jobs
 * 
 * Usage:
 *   node src/experiments/createJobs.js
 *   node src/experiments/createJobs.js --count 50
 *   node src/experiments/createJobs.js --count 100 --delay 2000
 */

import { Queue } from "bullmq";

const connection = {
    host: "localhost",
    port: 6379,
};

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const JOB_COUNT = parseInt(getArg("count", "100"), 10);
const DELAY_MS = parseInt(getArg("delay", "2000"), 10);
const QUEUE_NAME = getArg("queue", "stress-test");

async function createJobs() {
    const queue = new Queue(QUEUE_NAME, { connection });

    console.log(`\nCreating ${JOB_COUNT} jobs on queue "${QUEUE_NAME}" (delay: ${DELAY_MS}ms each)...\n`);

    const startTime = Date.now();

    for (let i = 1; i <= JOB_COUNT; i++) {
        await queue.add(`job-${i}`, {
            jobNumber: i,
            delayMs: DELAY_MS,
            fakeVideoId: `video-${String(i).padStart(3, "0")}`,
            createdAt: new Date().toISOString(),
        });

        if (i % 10 === 0) {
            console.log(`  Created ${i}/${JOB_COUNT} jobs...`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✔ All ${JOB_COUNT} jobs created in ${elapsed}s`);
    console.log(`  Queue  : ${QUEUE_NAME}`);
    console.log(`  Delay  : ${DELAY_MS}ms per job`);
    console.log(`  Expected time with 1 worker  : ~${((JOB_COUNT * DELAY_MS) / 1000).toFixed(0)}s`);
    console.log(`  Expected time with 5 workers : ~${((JOB_COUNT * DELAY_MS) / 5000).toFixed(0)}s\n`);

    await queue.close();
    process.exit(0);
}

createJobs().catch((err) => {
    console.error("Failed to create jobs:", err);
    process.exit(1);
});
