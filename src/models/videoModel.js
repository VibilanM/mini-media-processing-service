import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
    title: String,
    storageKey: String,
    status: {
        type: String,
        enum: ["queued", "processing", "completed", "failed"],
        default: "queued"
    },
}, { timestamps: true });

const Video = mongoose.model("Video", videoSchema);

export default Video;