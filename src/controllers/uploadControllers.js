import minioClient from "../storage/minio.client.js";

async function uploadVideo(req, res) {
    try {
        const objectKey = `${Date.now()}-${req.file.originalname}`;
        const bucketName = "media";

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

export { uploadVideo };