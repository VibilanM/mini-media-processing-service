import Video from "../models/videoModel.js";
import { deleteFile } from "../storage/objectStorage.service.js";
import minioClient from "../storage/minio.client.js";
import dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.MINIO_BUCKET;

const compensations = {
    async metadata(videoId) {
        await Video.findByIdAndUpdate(videoId, {
            $unset: {
                duration: "",
                width: "",
                height: "",
                container: "",
                bitrate: "",
                videoCodec: "",
                audioCodec: "",
            },
        });
    console.log(`[Compensate] Cleared metadata for ${videoId}`);
    },

    async thumbnail(videoId) {
        const objectKey = `thumnails/${videoId}-thumb.jpg`;
        try {
            await deleteFile(objectKey);
            await Video.findByIdAndUpdate(videoId, {
                $unset: { thumbnail: "" }
            });
            console.log(`[Compensate] Deleted thumbnail for ${videoId}`);
        }
        catch (err) {
            console.warn(`[Compensate] Thumbnail cleanup failed: ${err.message}`);
        }
    },

    async transcode(videoId) {
        for (const res of ["1080p", "720p", "480p"]) {
            try {
                await deleteFile(`videos/${videoId}-$res}.mp4`);
            }
            catch (err) {
                console.warn(`[Compensate] Transcode cleanup failed: ${err.message}`);
            }
        }
        await Video.findByIdAndUpdate(videoId, {
            versions: [],
            cachedVersions: []
        });
        console.log(`[Compensate] Deleted transcoded files for ${videoId}`);
    },

    async upload(videoId) {
        await compensations.transcode(videoId);
    },

    async hls(videoId) {
        const prefix = `videos/${videoId}/hls/`;
        const objectsStream = minioClient.listObjects(BUCKET, prefix, true);

        const objects = [];
        for await (const obj of objectsStream) {
            objects.push(obj.name);
        }

        if (objects.length > 0) {
            await minioClient.removeObjects(BUCKET, objects);
        }

        await Video.findByIdAndUpdate(videoId, {
            $unset: { hls: "" }
        });
        console.log(`[Compensate] Deleted HLS data for ${videoId}`);
    },
};

async function runCompensations(videoId, completedStages) {
    const reversed = [...completedStages].reverse();

    for (const stage of reversed) {
        if (compensations[stage]) {
            try {
                await compensations[stage](videoId);
            }
            catch (err) {
                console.error(`[Compensate] Failed to compensate ${stage}: ${err.message}`);
            }
        }
    }
}

export { runCompensations };