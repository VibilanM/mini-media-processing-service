import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { videosAPI, API_BASE } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import "./VideoPage.css";

export default function VideoPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

    const [video, setVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        videosAPI.getById(id)
            .then((res) => setVideo(res.data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    // Set up HLS player when video data is available
    useEffect(() => {
        if (!video?.hls?.playlistKey || !videoRef.current) return;

        const proxyUrl = `${API_BASE}/api/stream/${id}/playlist.m3u8`;

        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(proxyUrl);
            hls.attachMedia(videoRef.current);
            hlsRef.current = hls;

            return () => {
                hls.destroy();
                hlsRef.current = null;
            };
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = proxyUrl;
        }
    }, [video, id]);

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this video? This cannot be undone.")) return;

        setDeleting(true);
        try {
            await videosAPI.delete(id);
            navigate("/");
        } catch (err) {
            setError(err.message);
            setDeleting(false);
        }
    }

    if (loading) return <div className="video-page"><p className="vp-status">Loading...</p></div>;
    if (error) return <div className="video-page"><p className="vp-error">Error: {error}</p></div>;
    if (!video) return <div className="video-page"><p className="vp-error">Video not found</p></div>;

    const isOwner = user && video.uploaderId && user._id === video.uploaderId;

    return (
        <div className="video-page">
            <div className="vp-player-wrap">
                {video.hls?.playlistKey ? (
                    <video ref={videoRef} className="vp-player" controls />
                ) : (
                    <div className="vp-no-player">
                        {video.status === "completed"
                            ? "HLS not available for this video"
                            : `Processing... (${video.status} — ${video.progress || 0}%)`}
                    </div>
                )}
            </div>

            <div className="vp-details">
                <h1 className="vp-title">{video.title || "Untitled"}</h1>
                <div className="vp-meta">
                    <span className="vp-uploader">@{video.uploader}</span>
                    <span className="vp-date">{new Date(video.createdAt).toLocaleDateString()}</span>
                    <span className={`vp-status-badge vp-status-${video.status}`}>{video.status}</span>
                </div>

                {video.metadata?.duration && (
                    <div className="vp-specs">
                        <span>Duration: {Math.floor(video.metadata.duration / 60)}:{Math.floor(video.metadata.duration % 60).toString().padStart(2, "0")}</span>
                        {video.metadata.width && <span>Resolution: {video.metadata.width}×{video.metadata.height}</span>}
                        {video.metadata.codec && <span>Codec: {video.metadata.codec}</span>}
                    </div>
                )}

                {isOwner && (
                    <button
                        className="vp-delete-btn"
                        onClick={handleDelete}
                        disabled={deleting}
                    >
                        {deleting ? "Deleting..." : "Delete Video"}
                    </button>
                )}
            </div>
        </div>
    );
}
