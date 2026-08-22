import { Queue } from "bullmq";

const connection = {
    host: "localhost",
    port: 6379,
};

const videoQueue = new Queue("video-processing", { connection });

const deadLetterQueue = new Queue("video-processing-dlq", { connection });

export { videoQueue, deadLetterQueue };