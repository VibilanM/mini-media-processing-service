import { exec } from "node:child_process";

function getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
        exec(
            `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
            (err, stdout) => {
                if (err) return reject(err);
                resolve(JSON.parse(stdout));
            }
        );
    });
}

function simplify(info) {
    const video = info.streams.find(s => s.codec_type === "video");

    const audio = info.streams.find(s => s.codec_type === "audio");

    return {
        filename: info.format.filename,
        container: info.format.format_name,
        duration: Number(info.format.duration),
        bitrate: Number(info.format.bit_rate),
        videoCodec: video.codec_name,
        audioCodec: audio?.codec_name,
        width: Number(video.width),
        height: Number(video.height),
        frameRate: Number(video.avg_frame_rate)
    };
}

export {
    getVideoInfo,
    simplify
};