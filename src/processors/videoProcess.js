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

    const thumbnailFilename = `${videoId}-thumb.jpg`;
    const localThumbPath = path.join(TEMP_DIR, thumbnailFilename);

    await generateThumbnail(localInputPath, localThumbPath);

    const objectKey = `thumbnails/${thumbnailFilename}`;
    await uploadFile(localThumbPath, objectKey);

    await Video.findByIdAndUpdate(videoId, { thumbnail: objectKey });

    console.log(`[${videoId}] Thumbnail uploaded -> ${objectKey}`);
    return objectKey;
}

async function transcodeStage(videoId, localInputPath, sourceMetadata) {
    const versions = []

    for (const res of RESOLUTIONS) {
        if (res.width > sourceMetadata.width) {
            continue;
        }

        await updateStatus(videoId, "transcoding");
        console.log(`[${videoId}] Transcoding ${res.name}....`);

        const outputFilename = `${videoId}-$res.name}.mp4`;
        const localOutputPath = path.join(TEMP_DIR, outputFilename);

        await transcode(localInputPath, localOutputPath, res.width);

        const outputMeta = await extractMetadata(localOutputPath);

        versions.push({
            resolution: res.name,
            objectKey: `videos/${outputFilename}`,
            localPath: localOutputPath,
            width: outputMeta.width,
            height: outputMeta.height,
        });

        console.log(`[${videoId}] ${res.name} transcoded -> ${localOutputPath}`);
    }

    return versions;
}

async function uploadStage(videoId, versions) {
    await updateStatus(videoId, "uploading");

    for (const v of versions) {
        await uploadFile(v.localPath, v.objectKey);
        console.log(`[${videoId}] Uploaded ${v.resolution} -> ${v.objectKey}`);
    }
}

async function saveMetadataStage(videoId, versions) {
    const cleanVersions = versions.map(v => ({
        resolution: v.resolution,
        objectKey: v.objectKey,
        width: v.width,
        height: v.height,
    }));

    await Video.findByIdAndUpdate(videoId, {
        versions: cleanVersions,
        status: "completed",
    });

    console.log(`[${videoId}] All versions saved. Statys -> Completed`);
}

async function cleanupStage(videoId, localInputPath, versions) {
    const filesToDelete = [
        localInputPath,
        path.join(TEMP_DIR, `${videoId}-thumb.jpg`),
        ...versions.map(v => v.localPath),
    ];

    for (const filePath of fileToDelete) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[${videoId}] Deleted temp file: ${filePath}`);
            }
        }
        catch (error) {
            console.warn(`[${videoId}] Failed to delete ${filePath}: ${err.message}`);
        }
    }
}

async function processViceo(videoId, originalKey) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const localInputPath = path.join(TEMP_DIR, `${videoId}-original.mp4`);
    let versions = [];

    try {
        await downloadFile(originalKey, localInputPath);
        console.log(`[${videoId}] Downloaded original -> ${localInputPath}`);

        const metadata = await metadataStage(videoId, localInputPath);

        await thumbnailStage(videoId, localInputPath);

        versions = await transcodeStage(videoId, localInputPath, metadata);

        await uploadStage(videoId, versions);

        await saveMetadataStage(videoId, versions);
    }
    catch (err) {
        await updateStatus(videoId, "failed", {
            error: err.message || "Unknown error during processing"
        });

        console.error(`[${videoId}] Pipeline failed: ${err}`);
        throw err;
    }
    finally {
        await cleanupStage(videoId, localInputPath, versions);
    }
}

export { processVideo };