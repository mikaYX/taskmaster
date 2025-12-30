import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";
import { apiFetch, setAuthToken } from "@/lib/api";

export function LoginDialog({ isOpen, onClose, type, onLoginSuccess, lang, appMode, azureEnabled }) {
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const isTeam = appMode === 'team';
    const isUser = type === "user";
    const endpoint = isTeam ? "/api/login-user" : (isUser ? "/api/login-user" : "/api/login-admin");
    const titleKey = isTeam ? "login" : (isUser ? "loginUserTitle" : "loginAdminTitle");
    const pwdLabelKey = "passwordPlaceholder";

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await apiFetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },

                body: JSON.stringify(isTeam ? { username, password } : { password })
            });

            const data = await res.json();
            if (res.ok && data.token) {
                setAuthToken(data.token);
                onLoginSuccess(data.role); // 'user' or 'admin'
                onClose();
                setPassword("");
            } else {
                setError("Login failed");
            }
        } catch (err) {
            setError("Network or server error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{t(lang, titleKey)}</DialogTitle>
                    <DialogDescription className="hidden">Enter your credentials to log in.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleLogin} className="space-y-4 py-2">
                    {isTeam && (
                        <div className="space-y-2">
                            <Label htmlFor="login-username">{t(lang, 'username')}</Label>
                            <Input
                                id="login-username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Username"
                                autoComplete="username"
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="password">{t(lang, pwdLabelKey)}</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t(lang, "passwordPlaceholder")}
                            autoComplete="current-password"
                        />
                    </div>
                    {error && <div className="text-sm text-rose-500">{error}</div>}
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? "..." : t(lang, "doLogin")}
                        </Button>
                    </DialogFooter>
                </form>
                {azureEnabled && isTeam && (
                    <div className="pt-2 border-t mt-4">
                        <Button variant="outline" className="w-full flex items-center gap-2" onClick={() => window.location.href = '/api/auth/azure'}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" /><path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" /></svg>
                            Sign in with Microsoft
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
