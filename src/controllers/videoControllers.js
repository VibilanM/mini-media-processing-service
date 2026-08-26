import Video from "../models/videoModel.js";
import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

async function getAllVideos(req, res) {
    try {
        const videos = await Video.find({
            status: "completed",
            visibility: "public",
        })
            .populate("uploader", "username")
            .sort({ createdAt: -1 })
            .select("title thumbnail uploader createdAt duration versions hls");

        res.json({
            success: true,
            data: videos.map((video) => ({
                id: video._id,
                title: video.title,
                thumbnail: video.thumbnail,
                uploader: video.uploader?.username || "Unknown",
                uploaderId: video.uploader?._id || null,
                createdAt: video.createdAt,
                duration: video.duration,
                hasHLS: !!video.hls?.playlistKey,
            })),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch videos",
            error: error.message,
        });
    }
}

async function getVideoById(req, res) {
    try {
        const video = await Video.findById(req.params.id)
            .populate("uploader", "username");

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        res.json({
            success: true,
            data: {
                id: video._id,
                title: video.title,
                status: video.status,
                progress: video.progress || 0,
                currentStage: video.currentStage || null,
                visibility: video.visibility,
                uploader: video.uploader?.username || "Unknown",
                uploaderId: video.uploader?._id || null,
                thumbnail: video.thumbnail || null,
                versions: video.versions || [],
                hls: video.hls || null,
                metadata: {
                    duration: video.duration,
                    width: video.width,
                    height: video.height,
                    codec: video.videoCodec,
                },
                error: video.error || null,
                createdAt: video.createdAt,
                updatedAt: video.updatedAt,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get video",
            error: error.message,
        });
    }
}

async function deleteVideo(req, res) {
    try {
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        // Only the uploader can delete their own video
        if (!video.uploader || video.uploader.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own videos.",
            });
        }

        // Collect all MinIO object keys to delete
        const keysToDelete = [];

        // Original uploaded file
        if (video.originalKey) {
            keysToDelete.push(video.originalKey);
        }

        // Thumbnail
        if (video.thumbnail) {
            keysToDelete.push(video.thumbnail);
        }

        // Transcoded versions
        if (video.versions && video.versions.length > 0) {
            for (const version of video.versions) {
                if (version.objectKey) {
                    keysToDelete.push(version.objectKey);
                }
            }
        }

        // HLS files (playlist + segments)
        if (video.hls?.playlistKey) {
            const hlsPrefix = `videos/${video._id}/hls/`;
            try {
                const hlsObjects = [];
                const stream = minioClient.listObjects(BUCKET, hlsPrefix, true);
                for await (const obj of stream) {
                    hlsObjects.push(obj.name);
                }
                keysToDelete.push(...hlsObjects);
            } catch (err) {
                console.warn(`[Delete] Failed to list HLS objects for ${video._id}: ${err.message}`);
            }
        }

        // Delete all objects from MinIO
        for (const key of keysToDelete) {
            try {
                await minioClient.removeObject(BUCKET, key);
                console.log(`[Delete] Removed MinIO object: ${key}`);
            } catch (err) {
                console.warn(`[Delete] Failed to remove ${key}: ${err.message}`);
            }
        }

        // Delete the video document from MongoDB
        await Video.findByIdAndDelete(video._id);

        console.log(`[Delete] Video ${video._id} fully deleted (${keysToDelete.length} objects removed from MinIO)`);

        res.json({
            success: true,
            message: "Video deleted successfully.",
            data: {
                videoId: video._id,
                objectsRemoved: keysToDelete.length,
            },
        });
    } catch (error) {
        console.error("[Delete] Error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to delete video",
            error: error.message,
        });
    }
}

export { getAllVideos, getVideoById, deleteVideo };
