import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";
import { apiFetch, setAuthToken } from "@/lib/api";

export function LoginDialog({ isOpen, onClose, type, onLoginSuccess, lang }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const isUser = type === "user";
    const endpoint = isUser ? "/api/login-user" : "/api/login-admin";
    const titleKey = isUser ? "loginUserTitle" : "loginAdminTitle";
    const pwdLabelKey = isUser ? "pwdUser" : "pwdAdmin";

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await apiFetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
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
                    <DialogDescription>{/* Accessibility helper */}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleLogin} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="password">{t(lang, pwdLabelKey)}</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t(lang, "passwordPlaceholder")}
                        />
                    </div>
                    {error && <div className="text-sm text-rose-500">{error}</div>}
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? "..." : t(lang, "doLogin")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
