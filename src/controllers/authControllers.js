import User from "../models/userModel.js";
import { generateToken } from "../utils/jwt.js";
import { sendVerificationEmail } from "../services/emailService.js";

async function register(req, res) {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "username, email, and password are required.",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters.",
            });
        }

        // Check for existing user
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            const field = existingUser.email === email ? "email" : "username";
            return res.status(409).json({
                success: false,
                message: `A user with that ${field} already exists.`,
            });
        }

        // Create user — password is hashed by the pre-save hook
        const user = new User({
            username,
            email,
            passwordHash: password,
        });

        const verificationToken = user.generateVerificationToken();
        await user.save();

        // Send verification email (non-blocking — don't fail registration if email fails)
        sendVerificationEmail(email, verificationToken).catch((err) => {
            console.error(`[Auth] Failed to send verification email to ${email}:`, err);
        });

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: "User registered. Check your email to verify your account.",
            data: {
                user: user.toJSON(),
                token,
            },
        });
    } catch (error) {
        console.error("[Auth] Registration error:", error.message);
        res.status(500).json({
            success: false,
            message: "Registration failed.",
            error: error.message,
        });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "email and password are required.",
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                token,
            },
        });
    } catch (error) {
        console.error("[Auth] Login error:", error.message);
        res.status(500).json({
            success: false,
            message: "Login failed.",
            error: error.message,
        });
    }
}

async function getMe(req, res) {
    res.json({
        success: true,
        data: {
            user: req.user.toJSON(),
        },
    });
}

async function verifyEmail(req, res) {
    try {
        const { token } = req.params;

        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification token.",
            });
        }

        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        res.json({
            success: true,
            message: "Email verified successfully.",
        });
    } catch (error) {
        console.error("[Auth] Verification error:", error.message);
        res.status(500).json({
            success: false,
            message: "Email verification failed.",
            error: error.message,
        });
    }
}

export { register, login, getMe, verifyEmail };
