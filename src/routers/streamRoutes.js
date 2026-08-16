import express from "express";
import { streamProxy, getStreamUrl } from "../controllers/streamControllers.js";

const router = express.Router();

router.get("/:id/url", getStreamUrl);

router.get("/:id/:file", streamProxy);

export default router;