import path from "node:path";
import fs from "node:fs";
import Video from "../models/videoModel.js";
import { extractMetadata, generateThumbnail, transcode, generateHLS } from "../utils/ffmpeg.services.js";
import { uploadFile, downloadFile, uploadDirectory } from "../storage/objectStorage.service.js";

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

        const outputFilename = `${videoId}-${res.name}.mp4`;
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

async function hlsStage(videoId, versions) {
    await updateStatus(videoId, "generating_hls");

    const source = versions.find(v => v.resolution === "720p");

    if (!source) {
        console.log(`[${videoId}] No 720p version found. Skipping HLS.`);
        return null;
    }

    const hlsOutputDir = path.join(TEMP_DIR, `${videoId}-hls`);

    await generateHLS(source.localPath, hlsOutputDir);

    console.log(`[${videoId}] HLS generated in ${hlsOutputDir}`);

    const hlsObjectKeys = await uploadDirectory(hlsOutputDir, `videos/${videoId}/hls`);

    const playlistKey = `videos/${videoId}/hls/playlist.m3u8`;

    console.log(`[${videoId}] HLS upload complete. Playlist: ${playlistKey}`);

    return {
        playlistKey,
        segmentCount: hlsObjectKeys.filter(f => f.endsWith(".ts")).length,
        hlsOutputDir,
    };
}

async function saveMetadataStage(videoId, versions, hlsResult) {
    const cleanVersions = versions.map(v => ({
        resolution: v.resolution,
        objectKey: v.objectKey,
        width: v.width,
        height: v.height,
    }));

    const updateFields = {
        versions: cleanVersions,
        status: "completed",
    };

    if (hlsResult) {
        updateFields.hls = {
            playlistKey: hlsResult.playlistKey,
            segmentCount: hlsResult.segmentCount,
        };
    }

    await Video.findByIdAndUpdate(videoId, updateFields);

    console.log(`[${videoId}] All versions saved. Status -> completed`);
}

async function cleanupStage(videoId, localInputPath, versions, hlsResult) {
    const filesToDelete = [
        localInputPath,
        path.join(TEMP_DIR, `${videoId}-thumb.jpg`),
        ...versions.map(v => v.localPath),
    ];

    for (const filePath of filesToDelete) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[${videoId}] Deleted temp file: ${filePath}`);
            }
        }
        catch (error) {
            console.warn(`[${videoId}] Failed to delete ${filePath}: ${error.message}`);
        }
    }

    if (hlsResult?.hlsOutputDir && fs.existsSync(hlsResult.hlsOutputDir)) {
        fs.rmSync(hlsResult.hlsOutputDir, { recursive: true, force: true });
        console.log(`[${videoId}] Deleted HLS temp directory: ${hlsResult.hlsOutputDir}`);
    }
}

async function processVideo(videoId, originalKey) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const localInputPath = path.join(TEMP_DIR, `${videoId}-original.mp4`);
    let versions = [];
    let hlsResult = null;

    try {
        await downloadFile(originalKey, localInputPath);
        console.log(`[${videoId}] Downloaded original -> ${localInputPath}`);

        const metadata = await metadataStage(videoId, localInputPath);

        await thumbnailStage(videoId, localInputPath);

        versions = await transcodeStage(videoId, localInputPath, metadata);

        await uploadStage(videoId, versions);

        hlsResult = await hlsStage(videoId, versions);

        await saveMetadataStage(videoId, versions, hlsResult);
    }
    catch (err) {
        await updateStatus(videoId, "failed", {
            error: err.message || "Unknown error during processing"
        });

        console.error(`[${videoId}] Pipeline failed: ${err}`);
        throw err;
    }
    finally {
        await cleanupStage(videoId, localInputPath, versions, hlsResult);
    }
}

export { processVideo };