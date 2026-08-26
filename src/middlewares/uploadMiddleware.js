import multer from "multer";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "524288000"); // 500MB default

const ALLOWED_MIMETYPES = [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
];

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: diskStorage,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}. Accepted: ${ALLOWED_MIMETYPES.join(", ")}`), false);
        }
    },
});

export default upload;