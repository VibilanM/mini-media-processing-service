const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function apiRequest(path, options = {}) {
    const token = localStorage.getItem("token");

    const headers = {
        ...options.headers,
    };

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    const data = await response.json();

    if (!response.ok) {
        const errorMsg = data.error ? `${data.message} (${data.error})` : (data.message || `Request failed (${response.status})`);
        throw new Error(errorMsg);
    }

    return data;
}

// Auth
export const authAPI = {
    register: (username, email, password) =>
        apiRequest("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, email, password }),
        }),
    login: (email, password) =>
        apiRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        }),
    getMe: () => apiRequest("/api/auth/me"),
};

// Videos
export const videosAPI = {
    getAll: () => apiRequest("/api/videos"),
    getById: (id) => apiRequest(`/api/videos/${id}`),
    delete: (id) => apiRequest(`/api/videos/${id}`, { method: "DELETE" }),
    getStatus: (id) => apiRequest(`/api/uploads/video/${id}/status`),
    getStreamUrl: (id) => apiRequest(`/api/stream/${id}/url`),
};

// Upload
export const uploadAPI = {
    upload: (formData, onProgress) => {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem("token");
            const xhr = new XMLHttpRequest();

            xhr.open("POST", `${API_BASE}/api/uploads/`);

            if (token) {
                xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            xhr.addEventListener("load", () => {
                let data = null;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    // Response is not JSON
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    if (data) resolve(data);
                    else reject(new Error("Server returned an invalid success response"));
                } else {
                    if (data) {
                        reject(new Error(data.error ? `${data.message} (${data.error})` : (data.message || `Upload failed (${xhr.status})`)));
                    } else {
                        reject(new Error(`Server error (${xhr.status}): ${xhr.responseText || xhr.statusText || "Upload failed"}`));
                    }
                }
            });

            xhr.addEventListener("error", () => reject(new Error("Network error")));
            xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

            xhr.send(formData);
        });
    },
};

// Thumbnails — generate presigned URL
export function getThumbnailUrl(thumbnailKey) {
    if (!thumbnailKey) return null;
    return `${API_BASE}/api/uploads/objects/${encodeURIComponent(thumbnailKey)}/url`;
}

export { API_BASE };
