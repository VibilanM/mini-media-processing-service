import { exec } from "node:child_process";

function generateThumbnail(input, output) {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i "${input}" -frames:v 1 "${output}" -y`,
            (err) => {
                if (err) return reject(err);

                resolve();
            }
        );
    });
}

export {
    generateThumbnail
};