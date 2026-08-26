import "./ProgressBar.css";

export default function ProgressBar({ percent, label }) {
    return (
        <div className="progress-container">
            <div className="progress-bar-track">
                <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
            </div>
            <div className="progress-meta">
                <span className="progress-percent">{Math.round(percent)}%</span>
                {label && <span className="progress-label">{label}</span>}
            </div>
        </div>
    );
}
