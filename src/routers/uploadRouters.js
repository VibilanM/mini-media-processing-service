import express from "express";
import { uploadVideo } from "../controllers/uploadControllers.js";

const router = express.Router();

router.post("/", uploadVideo);

export default router;