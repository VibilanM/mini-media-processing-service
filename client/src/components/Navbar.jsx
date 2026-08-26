import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "./Navbar.css";

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate("/login");
    }

    return (
        <nav className="navbar">
            <div className="navbar-left">
                <Link to="/" className="navbar-brand">
                    <span className="brand-icon">▶</span>
                    <span className="brand-text">MediaProc</span>
                </Link>
            </div>

            <div className="navbar-right">
                <Link to="/" className="nav-link">Dashboard</Link>

                {user ? (
                    <>
                        <Link to="/upload" className="nav-link nav-upload">Upload</Link>
                        <span className="nav-user">@{user.username}</span>
                        <button onClick={handleLogout} className="nav-btn nav-logout">Logout</button>
                    </>
                ) : (
                    <>
                        <Link to="/login" className="nav-link">Login</Link>
                        <Link to="/register" className="nav-link nav-register">Register</Link>
                    </>
                )}
            </div>
        </nav>
    );
}
