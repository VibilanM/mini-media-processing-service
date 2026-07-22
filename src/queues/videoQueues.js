import { Queue } from "bullmq";

const videoQueue = new Queue("video-processing", {
    connection: {
        host: "localhost",
        port: 6379
    }
});

export default videoQueue;