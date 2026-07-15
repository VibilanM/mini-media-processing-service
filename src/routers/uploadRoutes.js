import express from "express";
import { uploadVideo } from "../controllers/uploadControllers.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", upload.single("video"), uploadVideo);

export default router;