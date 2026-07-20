import * as minio from "minio";
import dotenv from "dotenv";

dotenv.config();

const client = new minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
})

async function connectToMinIO() {
    try {
        const buckets = await client.listBuckets();

        console.log("Connected to MinIO");
        console.log(buckets);
    } catch (err) {
        console.error("Failed to connect");
        console.error(err.message);
    }
}

export { client, connectToMinIO };