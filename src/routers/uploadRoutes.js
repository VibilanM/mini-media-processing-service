import express from "express";
import multer from "multer";
import { uploadVideo, getAllObjects, downloadObject, deleteObject, getMetadata, getPresignedURL, getVideoStatus } from "../controllers/uploadControllers.js";
import upload from "../middlewares/uploadMiddleware.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Protected — only authenticated users can upload
// Wrapped in error handler so Multer errors (file size limit, file type limit) return JSON instead of HTML
router.post("/", authenticate, (req, res, next) => {
    upload.single("video")(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`,
                    error: err.code,
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message || "Upload failed",
                error: err.message,
            });
        }
        next();
    });
}, uploadVideo);

router.get("/objects", getAllObjects);

router.get("/objects/:key", downloadObject);

router.delete("/objects/:key", deleteObject);

router.get("/objects/get-metadata/:key", getMetadata);

router.get("/objects/:key/url", getPresignedURL);

router.get("/video/:id/status", getVideoStatus);

export default router;