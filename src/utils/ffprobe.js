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

export {
    getVideoInfo
};