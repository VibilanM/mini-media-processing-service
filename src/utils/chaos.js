import dotenv from "dotenv";

dotenv.config();

// Toggle this to enable/disable chaos testing
const CHAOS_ENABLED = process.env.CHAOS_ENABLED === "true";
const CHAOS_PROBABILITY = parseFloat(process.env.CHAOS_PROBABILITY || "0.3"); // 30% failure rate

function maybeFail(stageName) {
    if (!CHAOS_ENABLED) return;

    const roll = Math.random();
    if (roll < CHAOS_PROBABILITY) {
        const failures = [
            new Error(`ECONNRESET: Connection reset by peer during ${stageName}`),
            new Error(`ETIMEDOUT: Operation timed out during ${stageName}`),
            new Error(`ENOMEM: Cannot allocate memory during ${stageName}`),
            new Error(`Socket hang up during ${stageName}`),
        ];

        const failure = failures[Math.floor(Math.random() * failures.length)];
        console.error(`[CHAOS 🔥] Injecting failure in ${stageName}: ${failure.message}`);
        throw failure;
    }

    console.log(`[CHAOS ✅] ${stageName} survived (roll: ${roll.toFixed(2)})`);
}

export { maybeFail };
