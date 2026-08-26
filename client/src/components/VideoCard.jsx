import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE } from "../api/client.js";
import "./VideoCard.css";

export default function VideoCard({ video }) {
    const [thumbUrl, setThumbUrl] = useState(null);

    useEffect(() => {
        if (video.thumbnail) {
            fetch(`${API_BASE}/api/uploads/objects/${encodeURIComponent(video.thumbnail)}/url`)
                .then((r) => r.json())
                .then((data) => setThumbUrl(data.url))
                .catch(() => setThumbUrl(null));
        }
    }, [video.thumbnail]);

    function timeAgo(dateStr) {
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function formatDuration(seconds) {
        if (!seconds) return "";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    return (
        <Link to={`/video/${video.id}`} className="video-card">
            <div className="video-thumb-wrap">
                {thumbUrl ? (
                    <img src={thumbUrl} alt={video.title} className="video-thumb" />
                ) : (
                    <div className="video-thumb-placeholder">▶</div>
                )}
                {video.duration && (
                    <span className="video-duration">{formatDuration(video.duration)}</span>
                )}
            </div>
            <div className="video-info">
                <h3 className="video-title">{video.title || "Untitled"}</h3>
                <p className="video-uploader">@{video.uploader}</p>
                <p className="video-time">{timeAgo(video.createdAt)}</p>
            </div>
        </Link>
    );
}
