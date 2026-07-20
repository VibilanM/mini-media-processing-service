import express from "express";
import { uploadVideo, getAllObjects, downloadObject, deleteObject } from "../controllers/uploadControllers.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", upload.single("video"), uploadVideo);

router.get("/objects", getAllObjects);

router.get("/objects/:key", downloadObject);

router.delete("/objects/:key", deleteObject);

export default router;