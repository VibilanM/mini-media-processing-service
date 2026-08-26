import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import VideoPage from "./pages/VideoPage.jsx";
import VerifyPage from "./pages/VerifyPage.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Navbar />
                <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/video/:id" element={<VideoPage />} />
                    <Route path="/verify/:token" element={<VerifyPage />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
