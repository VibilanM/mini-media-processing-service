import { useEffect, useState } from "react";
import { videosAPI } from "../api/client.js";
import VideoCard from "../components/VideoCard.jsx";
import "./DashboardPage.css";

export default function DashboardPage() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        videosAPI.getAll()
            .then((res) => setVideos(res.data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="dashboard">
                <p className="dashboard-status">Loading videos...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard">
                <p className="dashboard-error">Error: {error}</p>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <h1 className="dashboard-title">Videos</h1>

            {videos.length === 0 ? (
                <p className="dashboard-empty">No videos yet. Be the first to upload!</p>
            ) : (
                <div className="video-grid">
                    {videos.map((video) => (
                        <VideoCard key={video.id} video={video} />
                    ))}
                </div>
            )}
        </div>
    );
}
