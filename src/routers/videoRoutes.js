import express from "express";
import { getAllVideos, getVideoById, deleteVideo } from "../controllers/videoControllers.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public — list all completed public videos
router.get("/", getAllVideos);

// Public — get single video details
router.get("/:id", getVideoById);

// Protected — delete video (uploader only)
router.delete("/:id", authenticate, deleteVideo);

export default router;
