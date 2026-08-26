import express from "express";
import { register, login, getMe, verifyEmail } from "../controllers/authControllers.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);

router.post("/login", login);

router.get("/me", authenticate, getMe);

router.get("/verify/:token", verifyEmail);

export default router;
