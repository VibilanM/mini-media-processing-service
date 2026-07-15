import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import cors from "cors";

dotenv.config();

connectDB();

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Media Processing Service",
        status: "ok"
    });
});

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`);
});

