const AUTH_TOKEN_KEY = "checklist_auth_token";

export function getAuthToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; } catch { return ""; }
}

export function setAuthToken(token) {
    try {
        if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch { }
}

export function clearAuthToken() {
    try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { }
}

export async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", "Bearer " + token);

    // No cookies / no session
    return fetch(url, {
        ...options,
        headers
    });
}

export async function downloadWithAuth(url, filename) {
    const r = await apiFetch(url, { method: "GET" });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert("Export error: " + (e.error || r.status));
        return;
    }
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}
