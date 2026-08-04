import minioClient from "./minio.client.js";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

async function uploadFile(filePath, objectKey) {
    const fileStream = fs.createReadStream(filePath);
    const stat = fs.statSync(filePath);

    await minioClient.putObject(BUCKET, objectKey, fileStream, stat.size);
    return objectKey;
}

async function downloadFile(objectKey, localPath) {
    await minioClient.fGetObject(BUCKET, objectKey, localPath);
    return localPath;
}

async function deleteFile(objectKey) {
    await minioClient.removeObject(BUCKET, objectKey);
}

async function getPresignedUrl(objectKey, expirySeconds = 60 * 60) {
    return await minioClient.presignedGetObject(BUCKET, objectKey, expirySeconds);
}

