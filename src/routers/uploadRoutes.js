import express from "express";
import { uploadVideo, getAllObjects } from "../controllers/uploadControllers.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", upload.single("video"), uploadVideo);

router.get("/objects", getAllObjects);

export default router;