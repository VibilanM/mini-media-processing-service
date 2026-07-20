import minioClient from "./minio.client.js";

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
        await ensureBucket("media");
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to initialize storage"
        });
    }
}

export default initializeStorage;