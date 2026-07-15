
function uploadVideo(req, res) {
    console.log("File Name:", req.file.originalname);
    console.log("MIME Type:", req.file.mimetype);
    console.log("Size:", req.file.size);

    res.json({
        message: "Upload successful!"
    });
};

export { uploadVideo };