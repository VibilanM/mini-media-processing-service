import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv";

dotenv.config();

async function uploadVideo(req, res) {
    try {
        const objectKey = `${Date.now()}-${req.file.originalname}`;
        const bucketName = process.env.MINIO_BUCKET;

        await minioClient.putObject(bucketName, objectKey, req.file.buffer, req.file.size, {
            'Content-Type': req.file.mimetype
        });

        res.status(201).json({
            success: true,
            message: "Video uploaded successfully",
            data: {
                bucketName,
                objectKey,
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

export { uploadVideo, getAllObjects, downloadObject };