import Video from "../models/videoModel.js";

const STAGE_PROGRESS = {
    queued: 0,
    metadata: 15,
    thumbnail: 25,
    transcoding_1080p: 40,
    transcoding_720p: 55,
    transcoding_480p: 70,
    uploading: 85,
    generating_hls: 92,
    completed: 100,
};

async function updateProgress(videoId, stage) {
    const progress = STAGE_PROGRESS[stage];

    if (progress == undefined) {
        console.warn(`[Progress] Unknown stage; "${stage}" for video ${videoId}`);
        return;
    }

    await Video.findByIdAndUpdate(videoId, {
        progress,
        currentStage: stage,
    });

    console.log(`[${videoId}] Progress -> ${progress}% (${stage})`);
}

async function resetProgress(videoId) {
    await Video.findByIdAndUpdate(videoId, {
        progress: 0,
        currentStage: null,
    });
    console.log(`[${videoId}] Progress reset to 0%`);
}

export { updateProgress, resetProgress, STAGE_PROGRESS };