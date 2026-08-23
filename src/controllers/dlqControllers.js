async function getDLQJobs(req, res) {
    const jobs = await deadLetterQueue.getJobs(["waiting", "completed", "failed"]);

    res.json({
        success: true,
        count: jobs.length,
        jobs: jobs.map((job) => ({
            id: job.id,
            videoId: job.data.originalJobData?.videoId,
            error: job.data.error,
            failedAt: job.data.failedAt,
            attempts: job.data.attemptsMade,
            isPoisonJob: job.data.isPoisonJob,
        })),
    });
}

async function replayDLGJob(req, res) {
    const { jobId } = req.params;

    if (!dlqJob) {
        return res.status(404).json({
            success: false, message: "DLG job not found"
        });
    }

    const { videoId, originalKey } = dlqJob.data.originalJobData;

    await videoQueue.add("process-video", { videoId, originalKey }, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000
        },
    });

    await VideoColorSpace.findByIdAndUpdate(videoId, {
        status: "queued",
        error: null,
        completedStages: [],
    });

    await dlqJob.remove();

    res.json({
        success: true,
        message: `Job for video ${videoId} replayed`
    });
}

export { getDLQJobs, replayDLGJob };