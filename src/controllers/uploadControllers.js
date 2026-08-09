import minioClient from "../storage/minio.client.js";
import fs from "node:fs";
import dotenv from "dotenv";
import Video from "../models/videoModel.js";
import videoQueue from "../queues/videoQueues.js";

dotenv.config();

async function uploadVideo(req, res) {
    try {
        const objectKey = `originals/${Date.now()}-${req.file.originalname}`;
        const bucketName = process.env.MINIO_BUCKET;

        const fileStream = fs.createReadStream(req.file.path);
        const stat = fs.statSync(req.file.path);

        await minioClient.putObject(bucketName, objectKey, fileStream, stat.size);

        const video = await Video.create({
            title: req.body.title,
            originalKey: objectKey,
            status: "queued",
        });

        await videoQueue.add("process-video", {
            videoId: video._id.toString(),
            originalKey: objectKey,
        });

        fs.unlinkSync(req.file.path);

        res.status(201).json({
            success: true,
            message: "Video uploaded and queued for processing",
            data: {
                video_id: video._id,
                status: video.status
            }
        });
    }
    catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
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

async function getVideoStatus(req, res) {
    try {
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
        }

        res.json({
            success: true,
            data: {
                id:        video._id,
                title:     video.title,
                status:    video.status,
                thumbnail: video.thumbnail || null,
                versions:  video.versions || [],
                metadata: {
                    duration:   video.duration,
                    width:      video.width,
                    height:     video.height,
                    codec:      video.videoCodec,
                },
                error:     video.error || null,
                createdAt: video.createdAt,
                updatedAt: video.updatedAt,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get video status",
            error: error.message
        });
    }
}


export { uploadVideo, getAllObjects, downloadObject, deleteObject, getMetadata, getPresignedURL, getVideoStatus };