import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: diskStorage
});

export default upload;