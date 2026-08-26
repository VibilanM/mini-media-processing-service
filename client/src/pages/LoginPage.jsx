import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Link, useNavigate } from "react-router-dom";
import "./AuthPages.css";

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await login(email, password);
            navigate("/");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <form className="auth-form" onSubmit={handleSubmit}>
                <h1 className="auth-title">Login</h1>

                {error && <div className="auth-error">{error}</div>}

                <label className="auth-label">
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input"
                        required
                        autoFocus
                    />
                </label>

                <label className="auth-label">
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input"
                        required
                    />
                </label>

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                </button>

                <p className="auth-switch">
                    Don't have an account? <Link to="/register">Register</Link>
                </p>
            </form>
        </div>
    );
}
