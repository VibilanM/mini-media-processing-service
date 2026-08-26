import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadAPI, videosAPI } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import "./UploadPage.css";

export default function UploadPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [file, setFile] = useState(null);
    const [title, setTitle] = useState("");
    const [error, setError] = useState("");

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Processing state
    const [videoId, setVideoId] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStage, setProcessingStage] = useState("");
    const [processingStatus, setProcessingStatus] = useState("");

    // Redirect if not logged in
    useEffect(() => {
        if (!user) navigate("/login");
    }, [user, navigate]);

    // Poll processing status
    useEffect(() => {
        if (!videoId || !processing) return;

        const interval = setInterval(async () => {
            try {
                const res = await videosAPI.getStatus(videoId);
                const data = res.data;
                setProcessingProgress(data.progress || 0);
                setProcessingStage(data.currentStage || "");
                setProcessingStatus(data.status);

                if (data.status === "completed") {
                    setProcessing(false);
                    clearInterval(interval);
                } else if (data.status === "failed") {
                    setProcessing(false);
                    setError(data.error || "Processing failed");
                    clearInterval(interval);
                }
            } catch (err) {
                console.error("Status poll error:", err.message);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [videoId, processing]);

    function handleFileChange(e) {
        const selected = e.target.files[0];
        if (selected) {
            setFile(selected);
            if (!title) {
                setTitle(selected.name.replace(/\.[^.]+$/, ""));
            }
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!file) return setError("Select a video file.");

        setError("");
        setUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append("video", file);
            formData.append("title", title || file.name);

            const res = await uploadAPI.upload(formData, setUploadProgress);

            setUploading(false);
            setVideoId(res.data.video_id);
            setProcessing(true);
            setProcessingProgress(0);
            setProcessingStage("queued");
            setProcessingStatus("queued");
        } catch (err) {
            setUploading(false);
            setError(err.message);
        }
    }

    return (
        <div className="upload-page">
            <div className="upload-card">
                <h1 className="upload-title">Upload Video</h1>

                {error && <div className="upload-error">{error}</div>}

                {!videoId ? (
                    <form onSubmit={handleSubmit}>
                        <label className="upload-label">
                            Title
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="upload-input"
                                placeholder="Video title"
                            />
                        </label>

                        <div
                            className="upload-dropzone"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {file ? (
                                <p className="dropzone-filename">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
                            ) : (
                                <p className="dropzone-prompt">Click to select a video file</p>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleFileChange}
                                style={{ display: "none" }}
                            />
                        </div>

                        {uploading && (
                            <div className="upload-progress-section">
                                <p className="upload-progress-label">Uploading...</p>
                                <ProgressBar percent={uploadProgress} label="Uploading to server" />
                            </div>
                        )}

                        <button type="submit" className="upload-submit" disabled={uploading || !file}>
                            {uploading ? "Uploading..." : "Upload"}
                        </button>
                    </form>
                ) : (
                    <div className="processing-section">
                        {processing ? (
                            <>
                                <h2 className="processing-heading">Processing your video...</h2>
                                <ProgressBar percent={processingProgress} label={processingStage} />
                                <p className="processing-status">Status: {processingStatus}</p>
                            </>
                        ) : processingStatus === "completed" ? (
                            <>
                                <h2 className="processing-heading processing-done">✓ Processing Complete!</h2>
                                <button
                                    className="upload-submit"
                                    onClick={() => navigate(`/video/${videoId}`)}
                                >
                                    Watch Video
                                </button>
                            </>
                        ) : (
                            <>
                                <h2 className="processing-heading processing-failed">Processing Failed</h2>
                                <p className="processing-error">{error}</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
