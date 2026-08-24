/**
 * Cleanup utility — Wipe experiment queues from Redis
 * 
 * Usage:
 *   node src/experiments/cleanup.js
 */

import { Queue } from "bullmq";

const connection = { host: "localhost", port: 6379 };

const QUEUES_TO_CLEAN = [
    "stress-test",
    "race-broken",
    "race-fixed",
    "idempotency-test",
];

async function cleanup() {
    console.log("\nCleaning up experiment queues...\n");

    for (const name of QUEUES_TO_CLEAN) {
        try {
            const queue = new Queue(name, { connection });
            await queue.obliterate({ force: true });
            await queue.close();
            console.log(`  ✔ Cleaned: ${name}`);
        } catch (err) {
            console.log(`  ✖ Skipped: ${name} (${err.message})`);
        }
    }

    console.log("\n✔ Cleanup complete.\n");
    process.exit(0);
}

cleanup().catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
});
