# Video Processing Pipeline — Complete Implementation Guide

## Where You Are Now

Your current codebase does this:

```
Upload video → Store in MinIO → Create MongoDB doc → Queue a BullMQ job → Worker fakes progress → Mark "ready"
```

The worker in [videoWorker.js](file:///d:/projects/mini-media-processing-service/src/workers/videoWorker.js) is a placeholder — it sleeps in a loop and logs percentages. No actual video processing happens. Your three empty files ([videoProcess.js](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js), [ffmpeg.services.js](file:///d:/projects/mini-media-processing-service/src/services/ffmpeg.services.js), [objectStorage.service.js](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js)) are exactly where the real work needs to go.

## Where You're Going

```
Upload → Queue Job → Worker picks up job
                         │
                         ├── Extract Metadata    (ffprobe → MongoDB)
                         ├── Generate Thumbnail  (ffmpeg → MinIO)
                         ├── Transcode 1080p     (ffmpeg → MinIO)
                         ├── Transcode 720p      (ffmpeg → MinIO)
                         ├── Transcode 480p      (ffmpeg → MinIO)
                         ├── Upload Outputs       (local files → MinIO)
                         ├── Save Metadata        (versions array → MongoDB)
                         └── Cleanup              (delete temp files)
```

Each stage updates the status in MongoDB so progress is visible.

---

## Overview: What Changes in Which File

| File | What to do |
|------|-----------|
| [videoModel.js](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js) | Add `thumbnail`, `versions`, `error`, and granular `status` enum |
| [ffmpeg.services.js](file:///d:/projects/mini-media-processing-service/src/services/ffmpeg.services.js) | Build all FFmpeg/FFprobe operations (metadata, thumbnail, transcode) |
| [objectStorage.service.js](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js) | Build MinIO upload/download/delete helpers |
| [videoProcess.js](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js) | Build the pipeline orchestrator with staged functions |
| [videoWorker.js](file:///d:/projects/mini-media-processing-service/src/workers/videoWorker.js) | Replace the fake loop with a call to the processor |
| [uploadControllers.js](file:///d:/projects/mini-media-processing-service/src/controllers/uploadControllers.js) | Move metadata extraction OUT of upload (let the worker do it), add `GET /videos/:id` |
| [uploadMiddleware.js](file:///d:/projects/mini-media-processing-service/src/middlewares/uploadMiddleware.js) | Switch from memory storage to disk storage (you need a file path for ffmpeg) |
| [uploadRoutes.js](file:///d:/projects/mini-media-processing-service/src/routers/uploadRoutes.js) | Add the new `GET /videos/:id` route |

---

## Step 0 — Install `fluent-ffmpeg` (optional but recommended)

You're currently shelling out to `ffmpeg` and `ffprobe` with raw `exec()`. That works, but `fluent-ffmpeg` gives you a cleaner API and handles errors better. This guide uses **raw exec** to stay consistent with what you already have, but know the option exists.

What you **do** need installed on your system:
- `ffmpeg` and `ffprobe` in your PATH (you already have these since your existing code uses them)

---

## Step 1 — Fix the Upload Middleware (Switch to Disk Storage)

### Why

Your current [uploadMiddleware.js](file:///d:/projects/mini-media-processing-service/src/middlewares/uploadMiddleware.js) uses `multer.memoryStorage()`. The file lives in RAM as a `Buffer`. But `ffmpeg` and `ffprobe` need a **file path** on disk — they can't read from a Node.js Buffer.

You actually have the disk storage code commented out already. Time to use it.

### What to change in [uploadMiddleware.js](file:///d:/projects/mini-media-processing-service/src/middlewares/uploadMiddleware.js)

```js
import multer from "multer";
import path from "node:path";

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: diskStorage
});

export default upload;
```

### What changes downstream

When you switch to disk storage, `req.file` no longer has `.buffer`. Instead it has:
- `req.file.path` → e.g. `"uploads/1722600000000-movie.mp4"` (you already use this for ffprobe)
- `req.file.filename` → e.g. `"1722600000000-movie.mp4"`

Your upload controller currently does `req.file.buffer` on line 16 when calling `minioClient.putObject()`. You'll need to change that to use `fs.createReadStream(req.file.path)` instead. More on that in Step 6.

---

## Step 2 — Expand the Video Model (The State Machine)

### Why

Your current [videoModel.js](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js) has `status` with 4 values: `queued`, `processing`, `completed`, `failed`. That's too coarse. When a video is stuck, you can't tell if it failed at metadata extraction or at 720p transcoding.

You also need fields for `thumbnail`, `versions`, and `error`.

### What to change in [videoModel.js](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js)

```js
import mongoose from "mongoose";

const versionSchema = new mongoose.Schema({
    resolution: String,    // "1080p", "720p", "480p"
    objectKey: String,     // "videos/abc-1080p.mp4"
    width: Number,
    height: Number,
}, { _id: false });

const videoSchema = new mongoose.Schema({
    title: String,
    originalKey: String,   // renamed from storageKey — this is the raw upload in MinIO

    status: {
        type: String,
        enum: [
            "uploaded",     // file is in MinIO, nothing else done
            "queued",       // job is in the BullMQ queue
            "metadata",     // extracting metadata
            "thumbnail",    // generating thumbnail
            "transcoding",  // transcoding in progress
            "uploading",    // uploading outputs to MinIO
            "completed",    // all done
            "failed"        // something broke
        ],
        default: "uploaded"
    },

    // Metadata (populated by ffprobe during processing)
    duration: Number,
    width: Number,
    height: Number,
    container: String,
    bitrate: Number,
    videoCodec: String,
    audioCodec: String,

    // Processing outputs
    thumbnail: String,           // "thumbnails/abc.jpg"
    versions: [versionSchema],   // array of transcoded versions

    // Error tracking
    error: String,               // "720p transcoding failed: ..."

}, { timestamps: true });

const Video = mongoose.model("Video", videoSchema);

export default Video;
```

### Key design decisions

1. **`originalKey` instead of `storageKey`** — clarity matters. This is the key for the *original* upload. Transcoded versions get their own keys in the `versions` array.

2. **Granular status enum** — each stage of the pipeline has its own status value. When you query the database, you can see exactly where processing is.

3. **`versionSchema` as a subdocument** — each transcoded version is an object with `resolution`, `objectKey`, `width`, and `height`. This is much better than a flat string because your frontend can enumerate versions.

4. **`error` field** — when `status` is `"failed"`, this field tells you what went wrong without digging through logs.

> [!IMPORTANT]
> **If you already have documents in MongoDB with the old schema**, they won't break. Mongoose schemas are flexible — old documents just won't have the new fields until you update them. But the `storageKey` → `originalKey` rename means old documents will have `storageKey` and new ones will have `originalKey`. You can either:
> - Run a migration script to rename the field in old documents
> - Or keep `storageKey` as the field name (less clean, but zero migration)

---

## Step 3 — Build the FFmpeg Service

### Why

Your [ffmpeg.js](file:///d:/projects/mini-media-processing-service/src/utils/ffmpeg.js) util has a single `generateThumbnail` function, and your [ffprobe.js](file:///d:/projects/mini-media-processing-service/src/utils/ffprobe.js) has `getVideoInfo` and `simplify`. These are scattered across `utils/`. The goal is to consolidate all FFmpeg/FFprobe operations into a single service file that the processor can call.

### What to write in [ffmpeg.services.js](file:///d:/projects/mini-media-processing-service/src/services/ffmpeg.services.js)

```js
import { exec } from "node:child_process";
import path from "node:path";

// ─── Helper: promisified exec ────────────────────────────────────────
function run(command) {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                // Attach stderr to the error so you can debug FFmpeg failures
                err.stderr = stderr;
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

// ─── 1. Extract Metadata ────────────────────────────────────────────
// Calls ffprobe on the input file and returns a clean object.
// This is the same logic from your existing ffprobe.js, consolidated here.
async function extractMetadata(inputPath) {
    const raw = await run(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`
    );

    const info = JSON.parse(raw);
    const video = info.streams.find(s => s.codec_type === "video");
    const audio = info.streams.find(s => s.codec_type === "audio");

    return {
        duration: Number(info.format.duration),
        width: Number(video.width),
        height: Number(video.height),
        container: info.format.format_name,
        bitrate: Number(info.format.bit_rate),
        videoCodec: video.codec_name,
        audioCodec: audio?.codec_name,
    };
}

// ─── 2. Generate Thumbnail ──────────────────────────────────────────
// Takes a screenshot at the 1-second mark (or first frame if video < 1s).
// Returns the output path so the caller can upload it.
async function generateThumbnail(inputPath, outputPath) {
    await run(
        `ffmpeg -i "${inputPath}" -ss 00:00:01 -frames:v 1 "${outputPath}" -y`
    );
    return outputPath;
}

// ─── 3. Transcode to a specific resolution ──────────────────────────
// This is the key function. It takes the original video and produces
// a version scaled to the target width × height.
//
// The ffmpeg flags explained:
//   -i             input file
//   -vf scale=     resize the video. Using -2 for height means
//                  "calculate automatically to preserve aspect ratio,
//                   and make sure it's divisible by 2" (required for h264)
//   -c:v libx264   encode video as H.264
//   -crf 23        quality (lower = better, 18-28 is sane range)
//   -preset medium speed/quality tradeoff
//   -c:a aac       encode audio as AAC
//   -b:a 128k      audio bitrate
//   -movflags +faststart  move the moov atom to the front for web streaming
//   -y             overwrite output without asking
//
async function transcode(inputPath, outputPath, width, height) {
    // Using scale=width:-2 preserves aspect ratio and ensures even dimensions.
    // If you pass both width and height, use scale=width:height and ffmpeg
    // will stretch. To avoid stretching, use width:-2.
    await run(
        `ffmpeg -i "${inputPath}" ` +
        `-vf "scale=${width}:-2" ` +
        `-c:v libx264 -crf 23 -preset medium ` +
        `-c:a aac -b:a 128k ` +
        `-movflags +faststart ` +
        `"${outputPath}" -y`
    );
    return outputPath;
}

export { extractMetadata, generateThumbnail, transcode };
```

### Things to understand

1. **`scale=${width}:-2`** — The `-2` tells FFmpeg: "calculate the height to maintain aspect ratio, and round to the nearest even number." H.264 requires even dimensions. If your source is 1920×800 (a cinematic ratio) and you scale to width 1280, FFmpeg will calculate height as 534 (which is even). If you hardcode `1280:720`, a non-16:9 video will get stretched.

2. **`-crf 23`** — Constant Rate Factor. This controls quality. Lower = better quality + bigger file. 23 is FFmpeg's default and a good starting point. For production, you might use 20 for 1080p and 24 for 480p.

3. **`-movflags +faststart`** — This is critical for web streaming. It moves the "moov atom" (the index) to the beginning of the file so browsers can start playing before the full file downloads.

4. **Error forwarding** — The `run()` helper attaches `stderr` to the error object. FFmpeg writes all its logging to stderr, so when a command fails, you'll need that to debug.

> [!TIP]
> **Your existing [ffmpeg.js](file:///d:/projects/mini-media-processing-service/src/utils/ffmpeg.js) and [ffprobe.js](file:///d:/projects/mini-media-processing-service/src/utils/ffprobe.js) in utils/ become dead code after this.** Don't delete them right away — finish the migration first, test everything, then remove them. Also update the upload controller to stop importing from those files (covered in Step 6).

---

## Step 4 — Build the Object Storage Service

### Why

Your upload controller currently calls `minioClient.putObject()` directly. The worker will also need to upload files (thumbnails, transcoded videos). Rather than importing the MinIO client everywhere and repeating the same pattern, build a service that wraps the common operations.

### What to write in [objectStorage.service.js](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js)

```js
import minioClient from "./minio.client.js";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

// ─── Upload a local file to MinIO ────────────────────────────────────
// filePath:  local path, e.g. "uploads/temp-1080p.mp4"
// objectKey: destination in MinIO, e.g. "videos/abc-1080p.mp4"
// Returns the objectKey for convenience.
async function uploadFile(filePath, objectKey) {
    const fileStream = fs.createReadStream(filePath);
    const stat = fs.statSync(filePath);

    await minioClient.putObject(BUCKET, objectKey, fileStream, stat.size);
    return objectKey;
}

// ─── Download a MinIO object to a local file ─────────────────────────
// You need this because the worker has to pull the original video
// from MinIO to a local temp path before ffmpeg can process it.
async function downloadFile(objectKey, localPath) {
    await minioClient.fGetObject(BUCKET, objectKey, localPath);
    return localPath;
}

// ─── Delete an object from MinIO ─────────────────────────────────────
async function deleteFile(objectKey) {
    await minioClient.removeObject(BUCKET, objectKey);
}

// ─── Get a presigned URL ─────────────────────────────────────────────
async function getPresignedUrl(objectKey, expirySeconds = 60 * 60) {
    return await minioClient.presignedGetObject(BUCKET, objectKey, expirySeconds);
}

export { uploadFile, downloadFile, deleteFile, getPresignedUrl };
```

### Things to understand

1. **`downloadFile` is new** — Your upload controller currently puts files into MinIO during the HTTP request. But the worker runs in a separate process. It needs to *pull* the original video back out of MinIO onto disk so FFmpeg can process it. The flow is: `MinIO → local temp file → ffmpeg → local output → MinIO`.

2. **`fGetObject` vs `getObject`** — `getObject` returns a stream, `fGetObject` writes directly to a file path. For the worker, `fGetObject` is simpler because you just give it a destination path and it handles the stream plumbing.

3. **Why wrap MinIO calls?** — Right now your controller imports `minioClient` directly and calls `minioClient.putObject(bucketName, ...)` with the bucket name inlined. By wrapping it in a service, you:
   - Don't repeat `process.env.MINIO_BUCKET` everywhere
   - Can swap MinIO for S3 or another provider later without changing every file
   - Can add logging, retries, or error handling in one place

---

## Step 5 — Build the Video Processor (The Pipeline)

This is the big one. This file orchestrates the entire processing workflow.

### What to write in [videoProcess.js](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js)

```js
import path from "node:path";
import fs from "node:fs";
import Video from "../models/videoModel.js";
import { extractMetadata, generateThumbnail, transcode } from "../services/ffmpeg.services.js";
import { uploadFile, downloadFile } from "../storage/objectStorage.service.js";

// ─── Configuration ───────────────────────────────────────────────────
// Add or remove resolutions here. No other code changes needed.
const RESOLUTIONS = [
    { name: "1080p", width: 1920 },
    { name: "720p",  width: 1280 },
    { name: "480p",  width: 854  },
];

// Temp directory for intermediate files
const TEMP_DIR = path.resolve("temp");

// ─── Helper: Update status in MongoDB ────────────────────────────────
async function updateStatus(videoId, status, extraFields = {}) {
    await Video.findByIdAndUpdate(videoId, { status, ...extraFields });
    console.log(`[${videoId}] Status → ${status}`);
}

// ─── Stage 1: Metadata ──────────────────────────────────────────────
async function metadataStage(videoId, localInputPath) {
    await updateStatus(videoId, "metadata");

    const metadata = await extractMetadata(localInputPath);

    // Save metadata to the database
    await Video.findByIdAndUpdate(videoId, {
        duration:   metadata.duration,
        width:      metadata.width,
        height:     metadata.height,
        container:  metadata.container,
        bitrate:    metadata.bitrate,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
    });

    console.log(`[${videoId}] Metadata extracted:`, metadata);
    return metadata;
}

// ─── Stage 2: Thumbnail ─────────────────────────────────────────────
async function thumbnailStage(videoId, localInputPath) {
    await updateStatus(videoId, "thumbnail");

    const thumbnailFilename = `${videoId}-thumb.jpg`;
    const localThumbPath = path.join(TEMP_DIR, thumbnailFilename);

    // Generate the thumbnail locally
    await generateThumbnail(localInputPath, localThumbPath);

    // Upload to MinIO
    const objectKey = `thumbnails/${thumbnailFilename}`;
    await uploadFile(localThumbPath, objectKey);

    // Save the object key in MongoDB
    await Video.findByIdAndUpdate(videoId, { thumbnail: objectKey });

    console.log(`[${videoId}] Thumbnail uploaded → ${objectKey}`);
    return objectKey;
}

// ─── Stage 3: Transcode ─────────────────────────────────────────────
// Loops over the RESOLUTIONS config and transcodes each one.
// Returns an array of { resolution, objectKey, width, height }.
async function transcodeStage(videoId, localInputPath, sourceMetadata) {
    const versions = [];

    for (const res of RESOLUTIONS) {
        // Skip resolutions larger than the source.
        // No point upscaling a 720p video to 1080p.
        if (res.width > sourceMetadata.width) {
            console.log(`[${videoId}] Skipping ${res.name} (source is only ${sourceMetadata.width}px wide)`);
            continue;
        }

        await updateStatus(videoId, "transcoding");
        console.log(`[${videoId}] Transcoding ${res.name}...`);

        const outputFilename = `${videoId}-${res.name}.mp4`;
        const localOutputPath = path.join(TEMP_DIR, outputFilename);

        // Transcode
        await transcode(localInputPath, localOutputPath, res.width);

        // We use width:-2 in ffmpeg so height is auto-calculated.
        // Extract the actual dimensions from the output file.
        const outputMeta = await extractMetadata(localOutputPath);

        versions.push({
            resolution: res.name,
            objectKey:  `videos/${outputFilename}`,
            localPath:  localOutputPath,  // keep for upload stage
            width:      outputMeta.width,
            height:     outputMeta.height,
        });

        console.log(`[${videoId}] ${res.name} transcoded → ${localOutputPath}`);
    }

    return versions;
}

// ─── Stage 4: Upload outputs to MinIO ────────────────────────────────
async function uploadStage(videoId, versions) {
    await updateStatus(videoId, "uploading");

    for (const v of versions) {
        await uploadFile(v.localPath, v.objectKey);
        console.log(`[${videoId}] Uploaded ${v.resolution} → ${v.objectKey}`);
    }
}

// ─── Stage 5: Save metadata to MongoDB ──────────────────────────────
async function saveMetadataStage(videoId, versions) {
    // Strip localPath before saving — MongoDB doesn't need it
    const cleanVersions = versions.map(v => ({
        resolution: v.resolution,
        objectKey:  v.objectKey,
        width:      v.width,
        height:     v.height,
    }));

    await Video.findByIdAndUpdate(videoId, {
        versions: cleanVersions,
        status:   "completed",
    });

    console.log(`[${videoId}] All versions saved. Status → completed`);
}

// ─── Stage 6: Cleanup temp files ────────────────────────────────────
async function cleanupStage(videoId, localInputPath, versions) {
    const filesToDelete = [
        localInputPath,                                              // downloaded original
        path.join(TEMP_DIR, `${videoId}-thumb.jpg`),                 // thumbnail
        ...versions.map(v => v.localPath),                           // transcoded files
    ];

    for (const filePath of filesToDelete) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[${videoId}] Deleted temp file: ${filePath}`);
            }
        } catch (err) {
            // Non-fatal. Log it but don't fail the whole pipeline.
            console.warn(`[${videoId}] Failed to delete ${filePath}:`, err.message);
        }
    }
}


// ─── Main Pipeline ──────────────────────────────────────────────────
// This is what the worker calls. One function, one try/catch.
async function processVideo(videoId, originalKey) {
    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const localInputPath = path.join(TEMP_DIR, `${videoId}-original.mp4`);
    let versions = [];

    try {
        // Step 0: Pull the original video from MinIO to local disk
        await downloadFile(originalKey, localInputPath);
        console.log(`[${videoId}] Downloaded original → ${localInputPath}`);

        // Step 1: Extract metadata
        const metadata = await metadataStage(videoId, localInputPath);

        // Step 2: Generate thumbnail
        await thumbnailStage(videoId, localInputPath);

        // Step 3: Transcode all resolutions
        versions = await transcodeStage(videoId, localInputPath, metadata);

        // Step 4: Upload all transcoded versions to MinIO
        await uploadStage(videoId, versions);

        // Step 5: Save version info to MongoDB + mark completed
        await saveMetadataStage(videoId, versions);

    } catch (err) {
        // If ANY stage fails, mark the video as failed with the error message
        await updateStatus(videoId, "failed", {
            error: err.message || "Unknown error during processing"
        });
        console.error(`[${videoId}] Pipeline failed:`, err);
        throw err;  // Re-throw so BullMQ marks the job as failed too
    } finally {
        // ALWAYS clean up temp files, even if processing failed
        await cleanupStage(videoId, localInputPath, versions);
    }
}

export { processVideo };
```

### Walkthrough of the pipeline flow

This is the most important part of the guide. Let's trace through what happens when a job is processed:

```
processVideo("abc123", "1722600000000-movie.mp4")
│
├─ 1. downloadFile()
│     MinIO object → temp/abc123-original.mp4
│     Now ffmpeg has a local file to work with.
│
├─ 2. metadataStage()
│     status → "metadata"
│     ffprobe temp/abc123-original.mp4 → { duration, width, height, ... }
│     Write metadata fields to MongoDB.
│
├─ 3. thumbnailStage()
│     status → "thumbnail"
│     ffmpeg → temp/abc123-thumb.jpg
│     uploadFile() → MinIO: thumbnails/abc123-thumb.jpg
│     MongoDB: thumbnail = "thumbnails/abc123-thumb.jpg"
│
├─ 4. transcodeStage()
│     For each resolution in RESOLUTIONS:
│       status → "transcoding"
│       Skip if source is smaller than target (no upscaling).
│       ffmpeg → temp/abc123-1080p.mp4
│       ffprobe the output to get actual dimensions.
│       Repeat for 720p, 480p.
│
├─ 5. uploadStage()
│     status → "uploading"
│     For each version:
│       uploadFile(temp/abc123-1080p.mp4) → MinIO: videos/abc123-1080p.mp4
│
├─ 6. saveMetadataStage()
│     MongoDB: versions = [{ resolution: "1080p", objectKey: "...", ... }, ...]
│     status → "completed"
│
└─ 7. cleanupStage() (runs in `finally`, always executes)
      Delete: temp/abc123-original.mp4
      Delete: temp/abc123-thumb.jpg
      Delete: temp/abc123-1080p.mp4
      Delete: temp/abc123-720p.mp4
      Delete: temp/abc123-480p.mp4
```

### Key design decisions

1. **Each stage is a separate `async function`** — You can test `thumbnailStage` in isolation. If it breaks, the error message points right to it. Compare this to a 300-line monolith where you'd have to step through everything.

2. **`try/catch/finally` in the main pipeline** — The `try` runs the happy path. If anything throws, the `catch` marks the database as `"failed"` and records the error message. The `finally` block always runs cleanup, so you don't leave temp files on disk even when things fail.

3. **`throw err` after marking failed** — This re-throws the error so BullMQ also knows the job failed. BullMQ tracks job states independently of your MongoDB status, and you want them in sync.

4. **Skipping upscale** — If someone uploads a 720p video, there's no point generating a 1080p version. It would just be a blurry upscale. The `if (res.width > sourceMetadata.width)` check handles this.

5. **Config-driven resolutions** — The `RESOLUTIONS` array at the top is the only place you define what transcodes to run. Want to add 1440p? Add one line. Want to remove 480p? Delete one line. No FFmpeg command duplication.

---

## Step 6 — Rewrite the Worker

### Why

Your current [videoWorker.js](file:///d:/projects/mini-media-processing-service/src/workers/videoWorker.js) has the processing logic inline (the fake sleep loop). The worker should be thin — it receives a job, calls the processor, and that's it. The worker doesn't know about FFmpeg, MinIO, or transcoding. It just says "process this video."

### What to change in [videoWorker.js](file:///d:/projects/mini-media-processing-service/src/workers/videoWorker.js)

```js
import { Worker } from "bullmq";
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { processVideo } from "../processors/videoProcess.js";

dotenv.config();
await connectDB();

const worker = new Worker(
    "video-processing",
    async (job) => {
        const { videoId, originalKey } = job.data;

        console.log(`[Worker] Picked up job for video: ${videoId}`);

        // This is it. One call. The processor handles everything.
        await processVideo(videoId, originalKey);

        console.log(`[Worker] Finished job for video: ${videoId}`);
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        },
        // Process one video at a time. FFmpeg is CPU-heavy.
        concurrency: 1,
    }
);

// Optional: listen for worker-level events
worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
});
```

### What changed and why

1. **Removed the fake loop** — The `for (let i = 20; ...)` sleep loop is gone. Real processing now happens via `processVideo()`.

2. **`originalKey` instead of `storageKey`** — Matching the renamed field in the model. This is the MinIO key for the original upload. The upload controller needs to pass this (see Step 7).

3. **`concurrency: 1`** — FFmpeg is CPU-intensive. If you set concurrency to 3, three videos transcode simultaneously, and each one takes 3× longer. For a single-server setup, process one at a time. You can increase this if you scale to multiple worker processes.

4. **Worker event listeners** — `completed` and `failed` events let you log at the worker level, independent of the processor's own logging. This is useful for monitoring.

5. **Top-level `await connectDB()`** — Your original code called `connectDB()` without awaiting. This means the MongoDB connection might not be ready when the first job arrives. With top-level await (which works because you have `"type": "module"` in package.json), the connection is guaranteed to be established before the worker starts.

---

## Step 7 — Update the Upload Controller

### What needs to change

Your current [uploadControllers.js](file:///d:/projects/mini-media-processing-service/src/controllers/uploadControllers.js) does **too much** during upload:
- It calls `ffprobe` to extract metadata (lines 14)
- It uploads to MinIO using `req.file.buffer` (line 16)
- It creates a MongoDB document with metadata already filled (lines 18-28)

The new design: **upload should just store the file and queue the job**. Let the worker handle metadata, thumbnails, and transcoding. This makes the upload endpoint fast (the user doesn't wait for ffprobe) and keeps all processing in the worker where it belongs.

### Changes to `uploadVideo` function

```js
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

        // With disk storage, req.file.path is the local file.
        // Upload it to MinIO using a read stream.
        const fileStream = fs.createReadStream(req.file.path);
        const stat = fs.statSync(req.file.path);

        await minioClient.putObject(bucketName, objectKey, fileStream, stat.size);

        // Create a minimal MongoDB document. No metadata yet —
        // the worker will extract it.
        const video = await Video.create({
            title: req.body.title,
            originalKey: objectKey,
            status: "queued",
        });

        // Queue the processing job
        await videoQueue.add("process-video", {
            videoId: video._id.toString(),
            originalKey: objectKey,
        });

        // Delete the local upload — it's in MinIO now.
        fs.unlinkSync(req.file.path);

        res.status(201).json({
            success: true,
            message: "Video uploaded and queued for processing",
            data: {
                videoId: video._id,
                status: video.status,
            }
        });
    } catch (error) {
        // Clean up the local file if something failed
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            message: "Failed to upload video",
            error: error.message
        });
    }
}
```

### Key differences from your current code

1. **No more `ffprobe` during upload** — Removed the `getVideoInfo()` and `simplify()` calls. The worker does this now.
2. **`fs.createReadStream` instead of `req.file.buffer`** — Because you switched to disk storage.
3. **`originalKey` uses `originals/` prefix** — Keeps originals separate from transcoded files in MinIO.
4. **Clean up the local file after upload** — `fs.unlinkSync(req.file.path)` removes the file from `uploads/` after it's safely in MinIO.
5. **Minimal MongoDB document** — Only `title`, `originalKey`, and `status: "queued"`. Everything else gets filled by the worker.

### New endpoint: `GET /videos/:id`

Add this function to the same controller file:

```js
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
```

Don't forget to add `getVideoStatus` to the export:

```js
export { uploadVideo, getAllObjects, downloadObject, deleteObject, getMetadata, getPresignedURL, getVideoStatus };
```

### Why this endpoint matters

This is how your frontend (or any client) polls for progress. Example usage:

```
POST /api/uploads          → Upload a video, get back { videoId: "abc123" }
GET  /api/videos/abc123    → { status: "transcoding", thumbnail: "...", versions: [] }
GET  /api/videos/abc123    → { status: "uploading", ... }
GET  /api/videos/abc123    → { status: "completed", versions: ["1080p", "720p", "480p"] }
```

---

## Step 8 — Add the Route

### What to change in [uploadRoutes.js](file:///d:/projects/mini-media-processing-service/src/routers/uploadRoutes.js)

Add the import and route:

```js
import express from "express";
import {
    uploadVideo, getAllObjects, downloadObject,
    deleteObject, getMetadata, getPresignedURL,
    getVideoStatus                               // ← new
} from "../controllers/uploadControllers.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", upload.single("video"), uploadVideo);

router.get("/objects", getAllObjects);
router.get("/objects/:key", downloadObject);
router.delete("/objects/:key", deleteObject);
router.get("/objects/get-metadata/:key", getMetadata);
router.get("/objects/:key/url", getPresignedURL);

// ─── New: Get video processing status ─────────────────
router.get("/videos/:id", getVideoStatus);

export default router;
```

> [!TIP]
> You might eventually want to put video routes in a separate router file (`videoRoutes.js`) and mount them at `/api/videos`. For now, adding to the existing router is fine.

---

## Step 9 — Create the `temp` Directory

The processor needs a `temp/` directory for intermediate files. Add it to the project root and gitignore it:

Add to [.gitignore](file:///d:/projects/mini-media-processing-service/.gitignore):
```
temp/
```

Create the directory:
```bash
mkdir temp
```

> [!NOTE]
> The processor's `processVideo()` function already handles creating `temp/` if it doesn't exist (`fs.mkdirSync(TEMP_DIR, { recursive: true })`). But it's good practice to create it explicitly and gitignore it.

---

## Step 10 — Testing the Pipeline (Step by Step)

Don't test everything at once. Follow this order:

### Test 1: Metadata extraction only

Comment out everything in `processVideo()` after `metadataStage()`. Upload a video. Check MongoDB:

```js
// In your mongo shell or Compass:
db.videos.findOne({ _id: ObjectId("your-video-id") })
```

You should see:
```json
{
    "status": "metadata",
    "duration": 123.45,
    "width": 1920,
    "height": 1080,
    "videoCodec": "h264"
}
```

If you don't see metadata fields, your ffprobe call is failing. Check:
- Is `ffprobe` installed and in your PATH?
- Is the temp file being downloaded from MinIO correctly?

### Test 2: Add thumbnail generation

Uncomment `thumbnailStage()`. Upload a video. Check:
- MinIO: Is there a `thumbnails/` prefix with a `.jpg` file?
- MongoDB: Does the `thumbnail` field have a value?

### Test 3: Add transcoding (start with just 480p)

Temporarily change `RESOLUTIONS` to only include 480p:
```js
const RESOLUTIONS = [
    { name: "480p", width: 854 },
];
```

This is faster to test. Upload a short video (5-10 seconds). Check:
- MinIO: Is there a `videos/` prefix with a `480p.mp4` file?
- Can you download and play the file?

### Test 4: Add all resolutions

Restore the full `RESOLUTIONS` array. Test with a short video.

### Test 5: Test failure handling

Upload a corrupted file (e.g., rename a .txt to .mp4). The pipeline should:
- Fail at `metadataStage()` (ffprobe can't read it)
- Set `status: "failed"` and `error: "..."` in MongoDB
- Still run cleanup

### Test 6: Test the API endpoint

```bash
# Upload
curl -X POST http://localhost:4000/api/uploads -F "video=@movie.mp4" -F "title=My Video"
# Response: { "data": { "videoId": "abc123" } }

# Poll status
curl http://localhost:4000/api/uploads/videos/abc123
# Response: { "status": "transcoding", ... }
```

---

## Complete File-by-File Summary

Here's every file that changes, in the order you should modify them:

### 1. [uploadMiddleware.js](file:///d:/projects/mini-media-processing-service/src/middlewares/uploadMiddleware.js)
Switch from `memoryStorage` to `diskStorage`. This gives you `req.file.path`.

### 2. [videoModel.js](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js)
Add granular status enum, `thumbnail` field, `versions` subdocument array, `error` field. Rename `storageKey` → `originalKey`.

### 3. [ffmpeg.services.js](file:///d:/projects/mini-media-processing-service/src/services/ffmpeg.services.js)
Write `extractMetadata()`, `generateThumbnail()`, `transcode()`. Each is a clean function that shells out to ffmpeg/ffprobe and returns a result.

### 4. [objectStorage.service.js](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js)
Write `uploadFile()`, `downloadFile()`, `deleteFile()`, `getPresignedUrl()`. Wraps MinIO client operations.

### 5. [videoProcess.js](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js)
Write the pipeline: `metadataStage()` → `thumbnailStage()` → `transcodeStage()` → `uploadStage()` → `saveMetadataStage()` → `cleanupStage()`. Exported as `processVideo()`.

### 6. [videoWorker.js](file:///d:/projects/mini-media-processing-service/src/workers/videoWorker.js)
Replace the fake loop with `await processVideo(videoId, originalKey)`. Add `concurrency: 1`. Await `connectDB()`.

### 7. [uploadControllers.js](file:///d:/projects/mini-media-processing-service/src/controllers/uploadControllers.js)
Simplify `uploadVideo` (remove ffprobe, use file stream, pass `originalKey`). Add `getVideoStatus` function.

### 8. [uploadRoutes.js](file:///d:/projects/mini-media-processing-service/src/routers/uploadRoutes.js)
Add `GET /videos/:id` route pointing to `getVideoStatus`.

### 9. [.gitignore](file:///d:/projects/mini-media-processing-service/.gitignore)
Add `temp/`.

---

## Common Mistakes to Avoid

| Mistake | Why it's a problem | What to do instead |
|---------|-------------------|---------------------|
| Using `req.file.buffer` after switching to disk storage | `buffer` is `undefined` with disk storage | Use `fs.createReadStream(req.file.path)` |
| Not awaiting `connectDB()` in the worker | First job might run before MongoDB is connected | `await connectDB()` at the top level |
| Hardcoding bucket name in every file | Duplication, easy to miss when changing | Use the storage service or a constant |
| Not deleting temp files on failure | Disk fills up over time | Use `finally` block for cleanup |
| Upscaling small videos | Wastes CPU and produces blurry output | Skip resolutions larger than source |
| Setting `concurrency` too high | FFmpeg is CPU-bound; parallel jobs slow everything | Start with 1, benchmark, then increase |
| Using `status: "processing"` for everything | Can't tell where the pipeline is stuck | Use granular statuses |

---

## What Your MongoDB Document Looks Like at Each Stage

```js
// After upload (before worker picks it up)
{
    _id: "abc123",
    title: "My Video",
    originalKey: "originals/1722600000000-movie.mp4",
    status: "queued",
    createdAt: "...",
    updatedAt: "..."
}

// After metadata extraction
{
    ...
    status: "metadata",
    duration: 127.5,
    width: 1920,
    height: 1080,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    bitrate: 5000000,
    videoCodec: "h264",
    audioCodec: "aac"
}

// After thumbnail generation
{
    ...
    status: "thumbnail",
    thumbnail: "thumbnails/abc123-thumb.jpg"
}

// During transcoding (status updates per resolution)
{
    ...
    status: "transcoding"
}

// After upload stage
{
    ...
    status: "uploading"
}

// Final completed state
{
    ...
    status: "completed",
    thumbnail: "thumbnails/abc123-thumb.jpg",
    versions: [
        { resolution: "1080p", objectKey: "videos/abc123-1080p.mp4", width: 1920, height: 1080 },
        { resolution: "720p",  objectKey: "videos/abc123-720p.mp4",  width: 1280, height: 720 },
        { resolution: "480p",  objectKey: "videos/abc123-480p.mp4",  width: 854,  height: 480 }
    ],
    error: null
}

// If something fails
{
    ...
    status: "failed",
    error: "720p transcoding failed: ffmpeg exited with code 1"
}
```

---

## Your MinIO Bucket Structure After Processing

```
media/
├── originals/
│   └── 1722600000000-movie.mp4      ← raw upload
├── thumbnails/
│   └── abc123-thumb.jpg              ← generated thumbnail
└── videos/
    ├── abc123-1080p.mp4              ← transcoded
    ├── abc123-720p.mp4               ← transcoded
    └── abc123-480p.mp4               ← transcoded
```

Clean. Organized. Each prefix tells you what kind of file it is.

---

## After You're Done — What to Clean Up

Once the pipeline is working, these files become dead code:

| File | Reason |
|------|--------|
| [ffmpeg.js](file:///d:/projects/mini-media-processing-service/src/utils/ffmpeg.js) | Replaced by `ffmpeg.services.js` |
| [ffprobe.js](file:///d:/projects/mini-media-processing-service/src/utils/ffprobe.js) | Replaced by `extractMetadata()` in `ffmpeg.services.js` |
| [execute.js](file:///d:/projects/mini-media-processing-service/src/utils/execute.js) | Empty file, never used |
| [dummyServer.js](file:///d:/projects/mini-media-processing-service/src/utils/dummyServer.js) | Test file, no longer needed |

Don't delete them until everything works. But once it does, remove them so future-you doesn't wonder what they're for.
