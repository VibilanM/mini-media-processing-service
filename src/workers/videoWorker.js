import { Worker } from "bullmq";
import Video from "../models/videoModel.js";

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId } = job.data;

        await Video.findByIdAndUpdate(videoId, {
            status: "processing"
        });

        console.log("Starting processing for job: ", videoId);

        for (let i = 0; i <= 100; i++) {
            await Video.findByIdAndUpdate(videoId, {
                status: `processing ${i}%`
        });
            
        await Video.findByIdAndUpdate(videoId, {
            status: "ready"
        });

        console.log("Processing completed for job: ", videoId);
        }
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        }
    }
);