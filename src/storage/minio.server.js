import minioClient from "./minio.client.js";
import dotenv from "dotenv";

dotenv.config();

async function ensureBucket(bucketName) {
    const exists = await minioClient.bucketExists(bucketName);

    if (!exists) {
        await minioClient.makeBucket(bucketName);
        console.log(`Bucket ${bucketName} created`);
    } else {
        console.log(`Bucket ${bucketName} already exists`);
    }
}

async function initializeStorage() {
    try {
        await ensureBucket(process.env.MINIO_BUCKET);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to initialize storage"
        });
    }
}

export default initializeStorage;