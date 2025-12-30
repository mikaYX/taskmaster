import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export function PasswordChangeDialog({ isOpen, onClose, onSave, lang, title, isForced }) {
    const [pwd, setPwd] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [strength, setStrength] = useState("weak"); // weak, strong

    useEffect(() => {
        if (isOpen) {
            setPwd("");
            setConfirm("");
            setError("");
            setStrength("weak");
        }
    }, [isOpen]);

    useEffect(() => {
        // Simple strength check
        // Strong: > 8 chars
        if (pwd.length >= 8) setStrength("strong");
        else setStrength("weak");
    }, [pwd]);

    const handleSave = (e) => {
        e.preventDefault();
        if (pwd !== confirm) {
            setError(t(lang, "pwdMismatch"));
            return;
        }
        onSave(pwd);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open && isForced) return; // Prevent closing if forced
            onClose();
        }}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{title || t(lang, "changePwd")}</DialogTitle>
                    <DialogDescription className="hidden">Change your account password securely</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">{t(lang, "newPwd")}</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={pwd}
                            onChange={(e) => setPwd(e.target.value)}
                            className={strength === "strong" ? "border-green-500 focus-visible:ring-green-500" : "border-amber-500 focus-visible:ring-amber-500"}
                            autoComplete="new-password"
                        />
                        <div className="text-xs flex items-center gap-1">
                            {strength === "strong" ? (
                                <><CheckCircle className="h-3 w-3 text-green-500" /> <span className="text-green-600">{t(lang, "pwdStrength")} {t(lang, "strong")}</span></>
                            ) : (
                                <><AlertTriangle className="h-3 w-3 text-amber-500" /> <span className="text-amber-600">{t(lang, "pwdStrength")} {t(lang, "weak")}</span></>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">{t(lang, "confirmPwd")}</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>
                    {error && (
                        <div className="text-red-500 text-sm flex items-center gap-2">
                            <XCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                    <DialogFooter>
                        {!isForced && (
                            <Button type="button" variant="outline" onClick={onClose}>
                                {t(lang, "cancel")}
                            </Button>
                        )}
                        <Button type="submit">
                            {t(lang, "confirm")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
