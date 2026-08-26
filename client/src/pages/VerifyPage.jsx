import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { authAPI } from "../api/client.js";
import "./VerifyPage.css";

export default function VerifyPage() {
    const { token } = useParams();
    const [status, setStatus] = useState("verifying");
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/auth/verify/${token}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setStatus("success");
                    setMessage("Your email has been verified!");
                } else {
                    setStatus("error");
                    setMessage(data.message || "Verification failed.");
                }
            })
            .catch(() => {
                setStatus("error");
                setMessage("Verification request failed.");
            });
    }, [token]);

    return (
        <div className="verify-page">
            <div className="verify-card">
                {status === "verifying" && <p className="verify-loading">Verifying your email...</p>}
                {status === "success" && (
                    <>
                        <p className="verify-success">✓ {message}</p>
                        <a href="/" className="verify-link">Go to Dashboard</a>
                    </>
                )}
                {status === "error" && (
                    <p className="verify-error">{message}</p>
                )}
            </div>
        </div>
    );
}
