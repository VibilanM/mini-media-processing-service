import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    verificationToken: {
        type: String,
        default: null,
    },
}, { timestamps: true });

// Hash password before saving (only when password is new/changed)
userSchema.pre("save", async function () {
    if (!this.isModified("passwordHash")) return;

    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Generate a random verification token
userSchema.methods.generateVerificationToken = function () {
    this.verificationToken = crypto.randomBytes(32).toString("hex");
    return this.verificationToken;
};

// Don't return sensitive fields in JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    delete obj.verificationToken;
    delete obj.__v;
    return obj;
};

const User = mongoose.model("User", userSchema);

export default User;
