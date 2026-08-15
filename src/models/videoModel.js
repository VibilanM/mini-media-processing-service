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
    hls: {
        playlistKey: String,
        segmentCount: Number,
    },
    error: String,
}, { timestamps: true });

const Video = mongoose.model("Video", videoSchema);

export default Video;