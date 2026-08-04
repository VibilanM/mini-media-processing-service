import path from "node:path";
import fs from "node:fs";
import Video from "../models/videoModel.js";
import { extractMetadata, generateThumbnail, transcode } from "../services/ffmpeg.services.js";
import { uploadFile, downloadFile } from "../storage/objectStorage.service.js";

const RESOLUTIONS = [
    { name: "1080p", width: 1920 },
    { name: "720p", width: 1280 },
    { name: "480p", width: 854 },
];

const TEMP_DIR = path.resolve("temp");

async function updateStatus(videoId, status, extraFields = {}) {
    await Video.findByIdAndUpdate(videoId, { status, ...extraFields });
    console.log(`[${videoId}] Status -> ${status}`);
}

async function metadataStage(videoId, localInputPath) {
    await updateStatus(videoId, "metadata");

    const metadata = await extractMetadata(localInputPath);

    await Video.findByIdAndUpdate(videoId, {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        container: metadata.container,
        bitrate: metadata.bitrate,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
    });

    console.log(`[${videoId}] Metadata extracted:`, metadata);
    return metadata;
}

async function thumbnailStage(videoId, localInputPath) {
    await updateStatus(videoId, "thumbnail");

    const thumbnailFilename = `${videoId}-thum.jpg`;
    const localThumbPath = path.join(TEMP_DIR, thumbnailFilename);

    await generateThumbnail(localInputPath, localThumbPath);

    const objectKey = `thumbnails/${thumbnailFilename}`;
    await uploadFile(localThumbPath, objectKey);

    await Video.findByIdAndUpdate(videoId, { thumbnail: objectKey });

    console.log(`[${videoId}] Thumbnail uploaded -> ${objectKey}`);
    return objectKey;
}

