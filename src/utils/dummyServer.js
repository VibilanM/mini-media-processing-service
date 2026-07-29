import express from "express";
import { getVideoInfo } from "../utils/ffprobe.js";

const app = express();

app.use(express.json());

app.get("/inspect", async (req, res) => {
    const data = await getVideoInfo("./uploads/Fun_Pannum_CJ_2_HD 720p_MEDIUM_FR30.mp4");

    res.json(data);
});

app.listen(3001, () => {
    console.log("Server running in port 3001");
});