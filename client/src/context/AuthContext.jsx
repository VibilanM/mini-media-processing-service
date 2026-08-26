import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            authAPI.getMe()
                .then((res) => setUser(res.data.user))
                .catch(() => {
                    localStorage.removeItem("token");
                    setToken(null);
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    async function login(email, password) {
        const res = await authAPI.login(email, password);
        localStorage.setItem("token", res.data.token);
        setToken(res.data.token);
        setUser(res.data.user);
        return res;
    }

    async function register(username, email, password) {
        const res = await authAPI.register(username, email, password);
        localStorage.setItem("token", res.data.token);
        setToken(res.data.token);
        setUser(res.data.user);
        return res;
    }

    function logout() {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
