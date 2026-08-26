import mongoose from "mongoose";

const versionSchema = new mongoose.Schema({
    resolution: String,
    objectKey: String,
    width: Number,
    height: Number,
}, {
    _id: false
});

const videoSchema = new mongoose.Schema({
    title: String,
    originalKey: String,
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    visibility: {
        type: String,
        enum: ["public", "private"],
        default: "public",
    },
    status: {
        type: String,
        enum: [
            "uploaded",
            "queued",
            "metadata",
            "thumbnail",
            "transcoding",
            "uploading",
            "generating_hls",
            "completed",
            "failed",
            "partial"
        ],
        default: "uploaded"
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
    },
    currentStage: {
        type: String,
        default: null,
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
    hls: {
        playlistKey: String,
        segmentCount: Number,
    },
    completedStages: {
        type: [String],
        default: [],
    },
    cachedMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    cachedVersions: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    error: String,
}, { timestamps: true });

// Index for the public dashboard query
videoSchema.index({ status: 1, visibility: 1, createdAt: -1 });

const Video = mongoose.model("Video", videoSchema);

export default Video;