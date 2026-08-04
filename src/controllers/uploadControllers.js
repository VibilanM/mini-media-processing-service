import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv";
import Video from "../models/videoModel.js";
import videoQueue from "../queues/videoQueues.js";
import { getVideoInfo, simplify } from "../utils/ffprobe.js";

dotenv.config();

async function uploadVideo(req, res) {
    try {
        const objectKey = `${Date.now()}-${req.file.originalname}`;
        const bucketName = process.env.MINIO_BUCKET;

        const metadata = simplify(await getVideoInfo(req.file.path));

        await minioClient.putObject(bucketName, objectKey, req.file.buffer, req.file.size, metadata);

        const video = await Video.create({
            title: req.body.title,
            storageKey: objectKey,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            container: metadata.container,
            bitrate: metadata.bitrate,
            videoCodec: metadata.videoCodec,
            audioCodec: metadata.audioCodec,
        })

        await videoQueue.add("process-video", {
            videoId: video._id,
            storageKey: objectKey,
        });

        res.status(201).json({
            success: true,
            message: "Video uploaded successfully",
            data: {
                video_id: video._id,
                bucketName,
                objectKey,
                status: video.status
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to upload video",
            error: error.message
        });
    }
};

async function getAllObjects(req, res) {
    try {
        const objects = [];

        const stream = minioClient.listObjects(process.env.MINIO_BUCKET, "", true);

        stream.on("data", (obj) => {
            objects.push({
                key: obj.name,
                size: obj.size,
                lastModified: obj.lastModified,
            });
        });

        stream.on("end", () => {
            res.json(objects);
        });

        stream.on("error", (error) => {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch objects",
                error: error.message
            });
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch objects",
            error: error.message
        })
    }
}

async function downloadObject(req, res) {
    try {
        const objectStream = await minioClient.getObject(process.env.MINIO_BUCKET, req.params.key);

        objectStream.pipe(res);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to download object",
            error: error.message
        });
    }
}

async function deleteObject(req, res) {
    try {
        await minioClient.removeObject(process.env.MINIO_BUCKET, req.params.key);

        res.json({
            message: "Deleted"
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to delete object",
            error: err.message
        });
    }
}

async function getMetadata(req, res) {
    try {
        const metadata = await minioClient.statObject(process.env.MINIO_BUCKET, req.params.key);

        res.json(metadata);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get metadata",
            error: error.message
        });
    }
}

async function getPresignedURL(req, res) {

    try {

        const url = await minioClient.presignedGetObject(
            "media",
            req.params.key,
            60 * 5
        );

        res.json({
            url
        });

    } catch (err) {

        res.status(500).json({
            message: err.message
        });

    }

}

export { uploadVideo, getAllObjects, downloadObject, deleteObject, getMetadata, getPresignedURL };