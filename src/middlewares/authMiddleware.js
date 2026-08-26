import { verifyToken } from "../utils/jwt.js";
import User from "../models/userModel.js";

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Provide a Bearer token.",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found. Token may be invalid.",
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token.",
        });
    }
}

// Same as authenticate but doesn't reject unauthenticated requests.
// Sets req.user if token is valid, otherwise req.user = null.
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.userId);
        req.user = user || null;
    } catch {
        req.user = null;
    }

    next();
}

export { authenticate, optionalAuth };
