import { exec } from "node:child_process";
import path from "node:path";

function run(command) {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                err.stderr = stderr;
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

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

async function generateThumbnail(inputPath, outputPath) {
    await run(
        `ffmpeg -i "${inputPath}" -ss 00:00:01 -frames:v 1 "${outputPath}" -y`
    );
    return outputPath;
}

async function transcode(inputPath, outputPath, width, height) {
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