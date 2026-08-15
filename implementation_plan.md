# Module 10: HLS Streaming — Complete Implementation Guide

This guide walks you through converting your processed videos into HLS streams, serving them from your backend, and understanding every concept along the way. Every code example is written to slot directly into your existing architecture.

---

## Your Current Architecture (What You Already Have)

```
Upload → Queue → Worker → Processor
                              │
                              ├── metadataStage()
                              ├── thumbnailStage()
                              ├── transcodeStage()    ← produces 1080p/720p/480p
                              ├── uploadStage()       ← sends MP4s to MinIO
                              ├── saveMetadataStage() ← records versions in Mongo
                              └── cleanupStage()
```

**Files you'll touch:**
| File | What changes |
|------|-------------|
| [`ffmpeg.services.js`](file:///d:/projects/mini-media-processing-service/src/utils/ffmpeg.services.js) | Add `generateHLS()` function |
| [`videoProcess.js`](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js) | Add `hlsStage()`, wire it into the pipeline |
| [`objectStorage.service.js`](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js) | Add `uploadDirectory()` helper |
| [`videoModel.js`](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js) | Add `hls` field + new status values |
| [`uploadRoutes.js`](file:///d:/projects/mini-media-processing-service/src/routers/uploadRoutes.js) | Add streaming routes |
| [`uploadControllers.js`](file:///d:/projects/mini-media-processing-service/src/controllers/uploadControllers.js) | Add `streamVideo()` + `getStreamUrl()` handlers |
| [`server.js`](file:///d:/projects/mini-media-processing-service/src/server.js) | Register stream routes |

**New files you'll create:**
| File | Purpose |
|------|---------|
| `src/routers/streamRoutes.js` | Stream route definitions |
| `src/controllers/streamControllers.js` | Stream request handlers |
| `test-player.html` (project root) | Simple HLS test page |

---

## Part 1: Generate HLS Manually (Terminal First)

Before writing any code, do this yourself in a terminal to understand what FFmpeg actually produces.

### Step 1.1 — Create a test directory

```powershell
mkdir d:\projects\mini-media-processing-service\hls-test
```

### Step 1.2 — Build the FFmpeg command yourself

Think about what you need:
- **Input**: An MP4 file (use one of your transcoded videos, or any `.mp4` you have)
- **Output format**: HLS (which means MPEG-TS segments + an M3U8 playlist)
- **Codec**: You want to copy the existing video/audio if it's already H.264/AAC, OR re-encode

Here's the command to reason through piece by piece:

```powershell
ffmpeg -i "path\to\your\video.mp4" `
  -c:v libx264 -crf 23 -preset medium `
  -c:a aac -b:a 128k `
  -f hls `
  -hls_time 6 `
  -hls_list_size 0 `
  -hls_segment_filename "d:\projects\mini-media-processing-service\hls-test\segment%03d.ts" `
  "d:\projects\mini-media-processing-service\hls-test\playlist.m3u8"
```

**Flag-by-flag breakdown — understand each one before running it:**

| Flag | What it does | Why you need it |
|------|-------------|-----------------|
| `-i "..."` | Input file | Your source MP4 |
| `-c:v libx264` | Video codec → H.264 | HLS requires H.264 (or H.265). You already use this in your `transcode()` function |
| `-crf 23` | Constant Rate Factor | Quality level (lower = better quality, bigger files). Same as your existing transcode |
| `-preset medium` | Encoding speed/quality tradeoff | Same as your existing transcode |
| `-c:a aac -b:a 128k` | Audio codec → AAC at 128kbps | HLS needs AAC audio |
| `-f hls` | **Output format = HLS** | This is the key flag. Without it, FFmpeg would output a single file. With it, FFmpeg generates `.m3u8` + `.ts` |
| `-hls_time 6` | Target segment duration in seconds | Each `.ts` segment ≈ 6 seconds. This controls the "granularity" of streaming |
| `-hls_list_size 0` | Include ALL segments in playlist | `0` means "list everything". Non-zero would create a sliding-window playlist (for live streams) |
| `-hls_segment_filename` | Naming pattern for segments | `%03d` = zero-padded 3-digit number → `segment000.ts`, `segment001.ts`, etc. |
| Last argument | Output playlist path | The `.m3u8` file FFmpeg writes |

> [!IMPORTANT]
> If your MP4 is **already** H.264/AAC (which it will be, since your `transcode()` function produces H.264), you can use `-c copy` instead of re-encoding. This is **much faster** because FFmpeg just repackages the data into `.ts` segments without decoding/re-encoding:
>
> ```powershell
> ffmpeg -i "path\to\your\720p.mp4" `
>   -c copy `
>   -f hls `
>   -hls_time 6 `
>   -hls_list_size 0 `
>   -hls_segment_filename "d:\projects\mini-media-processing-service\hls-test\segment%03d.ts" `
>   "d:\projects\mini-media-processing-service\hls-test\playlist.m3u8"
> ```
>
> The trade-off: `-c copy` is instant but segment boundaries may not be perfectly aligned to keyframes. For production, re-encoding with forced keyframe intervals is more reliable. For learning, either works.

### Step 1.3 — Run it and check

After running, you should see:

```
hls-test/
├── playlist.m3u8
├── segment000.ts
├── segment001.ts
├── segment002.ts
└── ... (number depends on your video length and segment duration)
```

---

## Part 2: Inspect the Generated Files

### Step 2.1 — Open the .m3u8

```powershell
cat d:\projects\mini-media-processing-service\hls-test\playlist.m3u8
```

You'll see something like:

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:7
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.006000,
segment000.ts
#EXTINF:6.006000,
segment001.ts
#EXTINF:5.972000,
segment002.ts
#EXTINF:3.128000,
segment003.ts
#EXT-X-ENDLIST
```

**Read this line by line:**

| Line | Meaning |
|------|---------|
| `#EXTM3U` | "This file is an M3U playlist" — magic header |
| `#EXT-X-VERSION:3` | HLS protocol version |
| `#EXT-X-TARGETDURATION:7` | Maximum segment duration (rounded up from your longest segment). The player uses this to decide buffer sizes |
| `#EXT-X-MEDIA-SEQUENCE:0` | Segments start from index 0 |
| `#EXTINF:6.006000,` | "The next segment is 6.006 seconds long" |
| `segment000.ts` | Relative path to that segment file |
| `#EXT-X-ENDLIST` | "This is a complete VOD playlist, no more segments coming." Without this tag, the player treats it as a **live** stream and keeps polling for new segments |

> [!NOTE]
> **Key insight**: The `.m3u8` is not the video. It's a **manifest** — a table of contents. The actual video bytes live in the `.ts` segment files. The player reads the manifest first, then fetches segments one by one.

### Step 2.2 — Examine a .ts segment

```powershell
ffprobe -v quiet -print_format json -show_format "d:\projects\mini-media-processing-service\hls-test\segment000.ts"
```

You'll see it's an MPEG-TS container (`format_name: "mpegts"`), approximately 6 seconds long, containing H.264 video + AAC audio. Each `.ts` file is a self-contained, independently decodable chunk of video.

---

## Part 3: Add HLS Generation to Your FFmpeg Service

### What to add to [`ffmpeg.services.js`](file:///d:/projects/mini-media-processing-service/src/utils/ffmpeg.services.js)

You already have a `run()` helper that wraps `exec()` in a Promise. You'll add a `generateHLS()` function that follows the exact same pattern as your existing `transcode()` function:

```js
async function generateHLS(inputPath, outputDir, segmentDuration = 6) {
    // Ensure the output directory exists
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, "playlist.m3u8");
    const segmentPattern = path.join(outputDir, "segment%03d.ts");

    await run(
        `ffmpeg -i "${inputPath}" ` +
        `-c copy ` +
        `-f hls ` +
        `-hls_time ${segmentDuration} ` +
        `-hls_list_size 0 ` +
        `-hls_segment_filename "${segmentPattern}" ` +
        `"${playlistPath}" -y`
    );

    return playlistPath;
}
```

**Why `-c copy` here?**

Think about *where* this function runs in your pipeline. By the time `generateHLS()` is called, `transcodeStage()` has already produced a 720p H.264/AAC MP4. Re-encoding it again would be:
1. Wasteful (CPU time for no quality improvement)
2. Potentially quality-degrading (generation loss from re-encoding)

`-c copy` just repackages the already-encoded streams into `.ts` segments. Instant.

**Don't forget to export it:**

```js
export { extractMetadata, generateThumbnail, transcode, generateHLS };
```

> [!TIP]
> You could also add a `segmentDuration` parameter to experiment with different segment lengths later (Part 10 of the module). Having it as a parameter now means you don't need to change this function later.

---

## Part 4: Add HLS Stage to Your Processor

This is where the pipeline change happens. You need to:
1. Create an `hlsStage()` function
2. Wire it into `processVideo()` between the upload stage and the save-metadata stage

### Step 4.1 — Understand the new pipeline flow

Your current `processVideo()` in [`videoProcess.js`](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js) does:

```
downloadFile()
    → metadataStage()
    → thumbnailStage()
    → transcodeStage()     ← returns versions[]
    → uploadStage()        ← uploads MP4s
    → saveMetadataStage()  ← saves to Mongo
    → cleanupStage()
```

After your change:

```
downloadFile()
    → metadataStage()
    → thumbnailStage()
    → transcodeStage()     ← returns versions[]
    → uploadStage()        ← uploads MP4s
    → hlsStage()           ← NEW: generate HLS from 720p, upload to MinIO
    → saveMetadataStage()  ← MODIFIED: also saves HLS info
    → cleanupStage()       ← MODIFIED: also cleans HLS temp dir
```

### Step 4.2 — Write the hlsStage function

Add this to [`videoProcess.js`](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js):

```js
import { extractMetadata, generateThumbnail, transcode, generateHLS } from "../utils/ffmpeg.services.js";

// ... existing code ...

async function hlsStage(videoId, versions) {
    await updateStatus(videoId, "generating_hls");

    // Find the 720p version to generate HLS from
    const source = versions.find(v => v.resolution === "720p");

    if (!source) {
        console.log(`[${videoId}] No 720p version found, skipping HLS`);
        return null;
    }

    // Create a local temp directory for HLS output
    const hlsOutputDir = path.join(TEMP_DIR, `${videoId}-hls`);

    // Generate HLS segments from the 720p MP4
    // source.localPath still exists at this point because cleanup hasn't run yet
    await generateHLS(source.localPath, hlsOutputDir);

    console.log(`[${videoId}] HLS generated in ${hlsOutputDir}`);

    // Read all files in the HLS output directory
    const hlsFiles = fs.readdirSync(hlsOutputDir);

    // Upload each file to MinIO
    const hlsObjectKeys = [];
    for (const filename of hlsFiles) {
        const localPath = path.join(hlsOutputDir, filename);
        const objectKey = `videos/${videoId}/hls/${filename}`;

        await uploadFile(localPath, objectKey);
        hlsObjectKeys.push(objectKey);

        console.log(`[${videoId}] Uploaded HLS file: ${objectKey}`);
    }

    const playlistKey = `videos/${videoId}/hls/playlist.m3u8`;

    console.log(`[${videoId}] HLS upload complete. Playlist: ${playlistKey}`);

    return {
        playlistKey,
        segmentCount: hlsFiles.filter(f => f.endsWith(".ts")).length,
        hlsOutputDir, // Pass this so cleanupStage can delete it
    };
}
```

> [!IMPORTANT]
> **Why do we use `source.localPath`?** Look at your `transcodeStage()` — it creates local files like `temp/<videoId>-720p.mp4` and stores the path in `versions[].localPath`. By the time `hlsStage()` runs, `cleanupStage()` hasn't executed yet, so those local files still exist. This is why the ordering matters: HLS generation MUST happen before cleanup.

### Step 4.3 — Wire it into processVideo()

Modify the `processVideo()` function. Here's the section you need to change (lines 141–165 of [`videoProcess.js`](file:///d:/projects/mini-media-processing-service/src/processors/videoProcess.js)):

```js
async function processVideo(videoId, originalKey) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const localInputPath = path.join(TEMP_DIR, `${videoId}-original.mp4`);
    let versions = [];
    let hlsResult = null;  // ← NEW

    try {
        await downloadFile(originalKey, localInputPath);
        console.log(`[${videoId}] Downloaded original -> ${localInputPath}`);

        const metadata = await metadataStage(videoId, localInputPath);

        await thumbnailStage(videoId, localInputPath);

        versions = await transcodeStage(videoId, localInputPath, metadata);

        await uploadStage(videoId, versions);

        hlsResult = await hlsStage(videoId, versions);  // ← NEW

        await saveMetadataStage(videoId, versions, hlsResult);  // ← MODIFIED
    }
    catch (err) {
        await updateStatus(videoId, "failed", {
            error: err.message || "Unknown error during processing"
        });

        console.error(`[${videoId}] Pipeline failed: ${err}`);
        throw err;
    }
    finally {
        await cleanupStage(videoId, localInputPath, versions, hlsResult);  // ← MODIFIED
    }
}
```

### Step 4.4 — Update saveMetadataStage()

Modify it to accept and store HLS info:

```js
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

    // Add HLS info if generation was successful
    if (hlsResult) {
        updateFields.hls = {
            playlistKey: hlsResult.playlistKey,
            segmentCount: hlsResult.segmentCount,
        };
    }

    await Video.findByIdAndUpdate(videoId, updateFields);

    console.log(`[${videoId}] All versions saved. Status -> Completed`);
}
```

### Step 4.5 — Update cleanupStage()

Add cleanup for the HLS temp directory:

```js
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

    // Clean up HLS temp directory
    if (hlsResult?.hlsOutputDir && fs.existsSync(hlsResult.hlsOutputDir)) {
        fs.rmSync(hlsResult.hlsOutputDir, { recursive: true, force: true });
        console.log(`[${videoId}] Deleted HLS temp directory: ${hlsResult.hlsOutputDir}`);
    }
}
```

---

## Part 5: Update the Video Model

### Step 5.1 — Add the `hls` field

In [`videoModel.js`](file:///d:/projects/mini-media-processing-service/src/models/videoModel.js), add an `hls` sub-document and the new `"generating_hls"` status:

```js
const videoSchema = new mongoose.Schema({
    title: String,
    originalKey: String,
    status: {
        type: String,
        enum: [
            "uploaded",
            "queued",
            "metadata",
            "thumbnail",
            "transcoding",
            "uploading",
            "generating_hls",  // ← NEW
            "completed",
            "failed"
        ],
        default: "uploaded"
    },
    duration: Number,
    width: Number,
    height: Number,
    container: String,
    bitrate: Number,
    videoCodec: String,
    audioCodec: String,
    thumbnail: String,
    versions: [versionSchema],
    hls: {                        // ← NEW
        playlistKey: String,
        segmentCount: Number,
    },
    error: String,
}, { timestamps: true });
```

> [!NOTE]
> **What the `hls` field stores conceptually:**
> ```
> MongoDB document
>    └── hls.playlistKey = "videos/abc123/hls/playlist.m3u8"
>
> MinIO bucket
>    └── videos/abc123/hls/
>        ├── playlist.m3u8          ← The actual playlist file
>        ├── segment000.ts
>        ├── segment001.ts
>        └── ...
> ```
> The database knows *where* it is. Storage holds *what* it is.

---

## Part 6: Add an `uploadDirectory()` Helper (Optional Refactor)

Your `hlsStage` currently uploads files one by one with `uploadFile()`. That works. But if you want a cleaner abstraction, you can add this to [`objectStorage.service.js`](file:///d:/projects/mini-media-processing-service/src/storage/objectStorage.service.js):

```js
async function uploadDirectory(localDir, objectKeyPrefix) {
    const files = fs.readdirSync(localDir);
    const uploadedKeys = [];

    for (const filename of files) {
        const localPath = path.join(localDir, filename);
        const stat = fs.statSync(localPath);

        // Skip subdirectories (HLS output is flat, but good practice)
        if (stat.isDirectory()) continue;

        const objectKey = `${objectKeyPrefix}/${filename}`;
        await uploadFile(localPath, objectKey);
        uploadedKeys.push(objectKey);
    }

    return uploadedKeys;
}
```

You'd need to add `path` to your imports:

```js
import path from "node:path";
```

And export it:

```js
export { uploadFile, downloadFile, deleteFile, getPresignedUrl, uploadDirectory };
```

Then your `hlsStage` could simplify to:

```js
const hlsObjectKeys = await uploadDirectory(hlsOutputDir, `videos/${videoId}/hls`);
```

This is optional. The loop-in-`hlsStage` approach works fine too. It's a question of where you want that logic to live.

---

## Part 7: Build the Streaming Endpoints

Now the fun part. Your server needs to let a player access the HLS files.

### Understanding the request flow

When a video player loads an HLS stream, this is exactly what happens on the wire:

```
Player: GET /api/stream/:id/playlist.m3u8
Server: returns the .m3u8 text file
Player: (parses the playlist, sees segment000.ts, segment001.ts, ...)
Player: GET /api/stream/:id/segment000.ts
Server: returns the binary .ts data
Player: GET /api/stream/:id/segment001.ts
Server: returns the binary .ts data
Player: (continues until all segments are fetched or user stops)
```

The player never downloads the entire video upfront. It fetches segments progressively — **that's what streaming means**.

### Step 7.1 — Create the stream controller

Create [`src/controllers/streamControllers.js`](file:///d:/projects/mini-media-processing-service/src/controllers/streamControllers.js):

```js
import Video from "../models/videoModel.js";
import { getPresignedUrl } from "../storage/objectStorage.service.js";
import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

// ──────────────────────────────────────────────
// Option A: Express proxies the files from MinIO
// ──────────────────────────────────────────────
// Player → Express → MinIO
//
// Express fetches the file from MinIO and pipes it to the response.
// Good for learning. Adds latency. Every byte flows through Express.

async function streamProxy(req, res) {
    try {
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found" });
        }

        if (!video.hls?.playlistKey) {
            return res.status(404).json({ success: false, message: "HLS not available for this video" });
        }

        // The "file" param captures everything after /stream/:id/
        // e.g. "playlist.m3u8" or "segment000.ts"
        const filename = req.params.file;
        const objectKey = `videos/${video._id}/hls/${filename}`;

        // Set the correct Content-Type
        if (filename.endsWith(".m3u8")) {
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        } else if (filename.endsWith(".ts")) {
            res.setHeader("Content-Type", "video/mp2t");
        }

        // Allow cross-origin requests (your test page might be on a different port)
        res.setHeader("Access-Control-Allow-Origin", "*");

        // Fetch from MinIO and pipe directly to the HTTP response
        const stream = await minioClient.getObject(BUCKET, objectKey);
        stream.pipe(res);
    } catch (error) {
        console.error(`[Stream Proxy] Error: ${error.message}`);
        res.status(500).json({ success: false, message: "Streaming failed", error: error.message });
    }
}

// ──────────────────────────────────────────────
// Option B: Pre-signed URL redirect
// ──────────────────────────────────────────────
// Player → MinIO (directly)
//
// Express generates a temporary signed URL and redirects the player.
// Better architecture: Express does zero I/O, MinIO serves the bytes.
//
// BUT there's a subtlety for HLS:
// The playlist.m3u8 contains relative paths like "segment000.ts".
// If you redirect the playlist to MinIO, the browser resolves
// "segment000.ts" relative to the MinIO URL, not your Express server.
// So we need to either:
//   (a) Rewrite the playlist to use absolute MinIO URLs, or
//   (b) Only use pre-signed URLs for the initial playlist request
//       and proxy the segments, or
//   (c) Generate pre-signed URLs for all segments and rewrite the playlist
//
// For learning, let's do the simplest version of Option B:
// Return the pre-signed playlist URL so the client can decide what to do.

async function getStreamUrl(req, res) {
    try {
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found" });
        }

        if (!video.hls?.playlistKey) {
            return res.status(404).json({ success: false, message: "HLS not available" });
        }

        // Generate a pre-signed URL for the playlist
        // This URL lets the player fetch the .m3u8 directly from MinIO
        const playlistUrl = await getPresignedUrl(video.hls.playlistKey, 60 * 60);

        res.json({
            success: true,
            data: {
                playlistUrl,
                // Note: the segments are referenced as relative paths in the playlist.
                // Since the playlist is served from MinIO, the player will try to fetch
                // segments relative to the MinIO URL, which works because they're all
                // in the same MinIO "directory".
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to generate stream URL", error: error.message });
    }
}

export { streamProxy, getStreamUrl };
```

> [!WARNING]
> **The pre-signed URL subtlety**: When MinIO serves `playlist.m3u8`, the playlist contains relative segment paths like `segment000.ts`. The player resolves these *relative to the playlist URL*. Since the playlist and segments are all in the same MinIO prefix (`videos/<id>/hls/`), the relative paths resolve correctly. But if you put the playlist and segments in different locations, this would break. Keep them together.

### Step 7.2 — Create the stream routes

Create [`src/routers/streamRoutes.js`](file:///d:/projects/mini-media-processing-service/src/routers/streamRoutes.js):

```js
import express from "express";
import { streamProxy, getStreamUrl } from "../controllers/streamControllers.js";

const router = express.Router();

// Option A: Proxy — Express fetches from MinIO and pipes to the player
// Usage: GET /api/stream/:id/playlist.m3u8
//        GET /api/stream/:id/segment000.ts
router.get("/:id/:file", streamProxy);

// Option B: Pre-signed URL — Returns a signed MinIO URL for direct access
// Usage: GET /api/stream/:id/url
router.get("/:id/url", getStreamUrl);

export default router;
```

> [!IMPORTANT]
> **Route ordering matters!** The `/:id/url` route must be registered **before** `/:id/:file`, because Express matches routes top-to-bottom. If `/:id/:file` comes first, a request to `/stream/abc123/url` would match with `file = "url"` and try to proxy a file called "url" from MinIO.
>
> Fix this by reordering:
> ```js
> router.get("/:id/url", getStreamUrl);       // ← specific route first
> router.get("/:id/:file", streamProxy);       // ← catch-all after
> ```

### Step 7.3 — Register routes in server.js

In [`server.js`](file:///d:/projects/mini-media-processing-service/src/server.js):

```js
import streamRoutes from "./routers/streamRoutes.js";

// ... existing middleware ...

app.use("/api/uploads", uploadRoutes);
app.use("/api/stream", streamRoutes);    // ← NEW
```

---

## Part 8: Test Without a Frontend

No React. Just a simple HTML file with an HLS player library.

### Step 8.1 — Create a test page

Create `test-player.html` in your project root:

```html
<!DOCTYPE html>
<html>
<head>
    <title>HLS Stream Test</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        body {
            background: #1a1a2e;
            color: #eee;
            font-family: monospace;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px;
        }
        video {
            width: 720px;
            max-width: 90vw;
            background: #000;
            border: 2px solid #333;
            border-radius: 8px;
        }
        input, button {
            padding: 8px 16px;
            margin: 8px;
            font-size: 14px;
            font-family: monospace;
            border-radius: 4px;
            border: 1px solid #444;
        }
        input { background: #16213e; color: #eee; width: 400px; }
        button { background: #0f3460; color: #eee; cursor: pointer; }
        button:hover { background: #1a4a8a; }
        .controls { margin: 20px 0; }
        h1 { color: #e94560; }
        #log {
            margin-top: 20px;
            padding: 16px;
            background: #16213e;
            border-radius: 8px;
            width: 720px;
            max-width: 90vw;
            max-height: 300px;
            overflow-y: auto;
            font-size: 12px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <h1>🎬 HLS Stream Test</h1>

    <div class="controls">
        <div>
            <label>Option A — Proxy URL:</label><br>
            <input id="proxyUrl" placeholder="http://localhost:4000/api/stream/VIDEO_ID/playlist.m3u8">
            <button onclick="loadProxy()">Play (Proxy)</button>
        </div>
        <br>
        <div>
            <label>Option B — Video ID (pre-signed):</label><br>
            <input id="videoId" placeholder="Enter video _id from MongoDB">
            <button onclick="loadPresigned()">Play (Pre-signed)</button>
        </div>
    </div>

    <video id="player" controls></video>

    <div id="log">Request log will appear here...\n</div>

    <script>
        const video = document.getElementById("player");
        const logEl = document.getElementById("log");

        function log(msg) {
            logEl.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
            logEl.scrollTop = logEl.scrollHeight;
        }

        function loadHLS(url) {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    debug: false,
                });

                hls.loadSource(url);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log(`Manifest loaded. ${hls.levels.length} quality level(s).`);
                    video.play();
                });

                hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                    log(`Segment loaded: ${data.frag.relurl} (${(data.frag.duration).toFixed(2)}s)`);
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    log(`ERROR: ${data.type} — ${data.details}`);
                    if (data.fatal) {
                        log("Fatal error. Playback stopped.");
                    }
                });

            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                // Safari has native HLS support
                video.src = url;
                video.addEventListener("loadedmetadata", () => video.play());
            } else {
                log("HLS is not supported in this browser.");
            }
        }

        // Option A: Direct proxy through Express
        function loadProxy() {
            const url = document.getElementById("proxyUrl").value.trim();
            if (!url) return log("Enter a proxy URL first");
            log(`Loading via proxy: ${url}`);
            loadHLS(url);
        }

        // Option B: Fetch pre-signed URL, then load
        async function loadPresigned() {
            const id = document.getElementById("videoId").value.trim();
            if (!id) return log("Enter a video ID first");

            log(`Fetching pre-signed URL for video: ${id}`);

            try {
                const resp = await fetch(`http://localhost:4000/api/stream/${id}/url`);
                const body = await resp.json();

                if (!body.success) {
                    return log(`Server error: ${body.message}`);
                }

                log(`Got pre-signed URL. Loading...`);
                loadHLS(body.data.playlistUrl);
            } catch (err) {
                log(`Fetch failed: ${err.message}`);
            }
        }
    </script>
</body>
</html>
```

### Step 8.2 — How to test

1. Upload a video through your existing `POST /api/uploads` endpoint
2. Wait for processing to complete (check with `GET /api/uploads/video/:id/status`)
3. Open `test-player.html` in your browser (just double-click it, or use `npx serve .`)
4. For **Option A** (proxy): Enter `http://localhost:4000/api/stream/<VIDEO_ID>/playlist.m3u8`
5. For **Option B** (pre-signed): Enter the video's `_id` from MongoDB

### Step 8.3 — What to watch in the Network tab

Open DevTools → Network tab. You should see requests in this order:

```
1. playlist.m3u8      ← First request, fetches the manifest
2. segment000.ts      ← Player starts fetching segments
3. segment001.ts      ← And the next...
4. segment002.ts      ← And so on...
```

> [!TIP]
> **This is the "free system-design professor" moment.** Each row in the Network tab shows you exactly how HTTP streaming works. The player doesn't wait for the whole video — it starts playback as soon as the first segment arrives. Filter by "Media" in the Network tab to see only the HLS-related requests.

---

## Part 9: Understand the Two Architecture Options

### Option A: Express Proxy

```
Browser ──GET──→ Express ──getObject──→ MinIO
Browser ←─pipe── Express ←──stream──── MinIO
```

**Pros:**
- Simple to implement (you already did it)
- Your backend controls access (auth, rate limiting)
- Single domain for the player (no CORS headaches)

**Cons:**
- Every byte of video flows through your Express server
- Doubles bandwidth usage (MinIO → Express → Browser)
- Express becomes a bottleneck under load

### Option B: Pre-signed URLs

```
Browser ──GET──→ Express (returns signed URL)
Browser ──GET──→ MinIO (directly, using signed URL)
```

**Pros:**
- Express does zero I/O after generating the URL
- MinIO serves files directly — it's designed for this
- Scales better (Express isn't in the data path)

**Cons:**
- Slightly more complex (CORS on MinIO, URL expiry)
- Pre-signed URLs can be shared (time-limited, but still)

**For production, Option B is clearly better.** Express should orchestrate, not shuttle bytes. But implementing both gives you hands-on experience with the trade-offs.

---

## Part 10: Experiment with Segment Duration

Go back to Part 1 and generate HLS with different segment durations:

### 2-second segments:
```powershell
ffmpeg -i "path\to\720p.mp4" -c copy -f hls -hls_time 2 -hls_list_size 0 `
  -hls_segment_filename "hls-test-2s\segment%03d.ts" "hls-test-2s\playlist.m3u8"
```

### 6-second segments:
```powershell
ffmpeg -i "path\to\720p.mp4" -c copy -f hls -hls_time 6 -hls_list_size 0 `
  -hls_segment_filename "hls-test-6s\segment%03d.ts" "hls-test-6s\playlist.m3u8"
```

### What to observe:

| Metric | 2-second segments | 6-second segments |
|--------|------------------|------------------|
| Number of `.ts` files | **More** (30s video = ~15 files) | **Fewer** (30s video = ~5 files) |
| Playlist size | Larger (more `#EXTINF` entries) | Smaller |
| Startup speed | **Faster** (first segment = 2s of data) | Slower (first segment = 6s of data) |
| Request frequency | Higher (player fetches more often) | Lower |
| Seek precision | **Better** (can jump to within 2s) | Worse (can only jump to within 6s) |
| HTTP overhead | Higher (more requests = more headers) | Lower |

> [!NOTE]
> **Real-world default**: Most HLS streams use 6-second segments. Apple's HLS spec recommends 6s. Netflix uses 2-4s for their custom protocols. The trade-off is startup-latency vs. request-overhead. For VOD (which is what you're building), 6s is fine. For live streaming, shorter segments reduce latency.

---

## Part 11: Deliberately Break It

This is the best way to understand why manifest-segment consistency matters.

### Step 11.1 — Generate HLS normally

Do Part 1 again so you have a working HLS output.

### Step 11.2 — Delete a segment from the middle

```powershell
del d:\projects\mini-media-processing-service\hls-test\segment002.ts
```

### Step 11.3 — Try to play it

Load the playlist in your test page. What happens?

The playlist still says:
```
#EXTINF:5.972000,
segment002.ts
```

But when the player requests `segment002.ts`, your server returns **404**.

**What you'll observe:**
- Segments 000 and 001 play fine
- At segment 002, the player either:
  - **Skips** to the next available segment (with a visible jump/stutter)
  - **Stalls** and shows a buffering spinner
  - **Errors out** entirely (depends on the player implementation)

### Why this matters

In your pipeline, if `uploadFile()` fails for one segment but succeeds for the playlist, you've created this exact scenario. That's why:

1. **Upload all segments before the playlist** — some pipelines upload segments first, playlist last, so the manifest never references segments that don't exist yet
2. **Treat the upload as atomic** — if any segment upload fails, don't upload the playlist. Mark the job as failed
3. **Your `hlsStage()` already handles this correctly** — all files are uploaded in a loop, and if any `uploadFile()` throws, the entire stage fails, and the pipeline falls into the `catch` block

---

## Complete File Map — Summary of All Changes

```
src/
├── utils/
│   └── ffmpeg.services.js          ← ADD: generateHLS()
├── processors/
│   └── videoProcess.js             ← ADD: hlsStage()
│                                     MOD: processVideo(), saveMetadataStage(), cleanupStage()
├── storage/
│   └── objectStorage.service.js    ← ADD: uploadDirectory() (optional)
├── models/
│   └── videoModel.js               ← ADD: hls field, "generating_hls" status
├── controllers/
│   ├── uploadControllers.js        ← (no changes needed)
│   └── streamControllers.js        ← NEW: streamProxy(), getStreamUrl()
├── routers/
│   ├── uploadRoutes.js             ← (no changes needed)
│   └── streamRoutes.js             ← NEW: /api/stream routes
├── server.js                       ← ADD: import and mount streamRoutes
└── ...

test-player.html                    ← NEW: HLS test page (project root)
```

---

## Checklist — What You Should Be Able To Demonstrate After Completing This

| Category | Item | How to verify |
|----------|------|---------------|
| FFmpeg | Convert MP4 → HLS | Run the manual command, check `.m3u8` + `.ts` files exist |
| FFmpeg | Understand `.m3u8` | Open it, read the `#EXTINF` entries, explain what they mean |
| FFmpeg | Understand `.ts` segments | Run `ffprobe` on one, see it's MPEG-TS with H.264 |
| Object Storage | Upload `.m3u8` to MinIO | Check MinIO console after processing a video |
| Object Storage | Upload all segments | Verify all `segmentXXX.ts` keys exist in MinIO |
| Backend | Retrieve HLS playlist (proxy) | `curl http://localhost:4000/api/stream/:id/playlist.m3u8` |
| Backend | Serve segments (proxy) | Watch Network tab — segments load sequentially |
| Backend | Generate pre-signed URL | `curl http://localhost:4000/api/stream/:id/url` |
| Understanding | Explain the full flow | MP4 → FFmpeg → .m3u8 + .ts → Player requests playlist → Player requests segments → Playback |
| Experimentation | Different segment durations | Compare 2s vs 6s and explain trade-offs |
| Experimentation | Broken segment test | Delete a segment, observe the failure mode |
