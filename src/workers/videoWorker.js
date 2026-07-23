import { Worker } from "bullmq";
import Video from "../models/videoModel.js";
import dotenv from "dotenv";
import connectDB from "../config/db.js";

dotenv.config();
connectDB();

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId } = job.data;

        await Video.findByIdAndUpdate(videoId, {
            status: "processing"
        });

        console.log("Starting processing for job: ", videoId);

        for (let i = 20; i <= 100; i += 20) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`Processing ${i}%`);
        }

        await Video.findByIdAndUpdate(videoId, {
            status: "ready"
        });

        console.log("Processing completed for job: ", videoId);
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        }
    }
);