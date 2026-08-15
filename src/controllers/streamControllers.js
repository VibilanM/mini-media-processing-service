import Video from "../models/videoModel.js";
import { getPresignedUrl } from "../storage/objectStorage.service.js";
import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv"

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

async function streamProxy(req, res) {
    try {
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found." });
        }

        if (!video.hls?.playlistKey) {
            return res.status(404).json({ success: false, message: "HLS not available for this video" });
        }

        const filename = req.params.file;
        const objectKey = `videos/${video._id}/hls/${filename}`;

        if (filename.endsWith(".m3u8")) {
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        }
        else if (filename.endsWith(".ts")) {
            res.setHeader("Content-Type", "video/mp2t");
        }

        res.setHeader("Access-Control-Allow-Origin", "*");

        const stream = await minioClient.getObject(BUCKET, objectKey);
        stream.pipe(res);
    }
    catch (error) {
        console.error(`[Stream Proxy] Error: ${error.message}`);
        res.status(500).json({ success: false, message: "Streaming failed", error: error.message });
    }
}

