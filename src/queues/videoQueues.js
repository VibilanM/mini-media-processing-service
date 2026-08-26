import { Queue } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

const connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
};

const videoQueue = new Queue("video-processing", { connection });

const deadLetterQueue = new Queue("video-processing-dlq", { connection });

export { videoQueue, deadLetterQueue };