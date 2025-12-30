import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";
import { User, Mail, Tag } from "lucide-react";

export function UserDetailsDialog({ isOpen, onClose, user, onSave, lang }) {
    const [username, setUsername] = useState("");
    const [fullname, setFullname] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (isOpen && user) {
            setUsername(user.username || "");
            setFullname(user.fullname || "");
            setEmail(user.email || "");
            setError("");
        }
    }, [isOpen, user]);

    const isValidEmail = (email) => {
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSave = () => {
        if (email && !isValidEmail(email)) {
            setError(t(lang, "invalidEmail") || "Invalid email format");
            return;
        }
        if (!username.trim()) {
            setError((t(lang, "username") || "Username") + " is required");
            return;
        }
        // Check if trying to rename 'admin'
        if ((user.username === 'admin' || user.id === 1) && username !== user.username) {
            setError("Cannot rename the default 'admin' account.");
            return;
        }

        onSave({ username, fullname, email });
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{t(lang, "editUserDetails") || "Edit User Details"}</DialogTitle>
                    <DialogDescription className="hidden">Update User Information</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {/* Username Input - Editable for all types */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-username" className="flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            {t(lang, "username") || "Username"}
                        </Label>
                        <Input
                            id="edit-username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            disabled={user?.username === 'admin' || user?.id === 1} // Protect default admin from rename
                            className={(user?.username === 'admin' || user?.id === 1) ? "bg-slate-100 dark:bg-slate-800 cursor-not-allowed" : ""}
                            autoComplete="username"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-fullname" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {t(lang, "fullName")}
                        </Label>
                        <Input
                            id="edit-fullname"
                            value={fullname}
                            onChange={(e) => setFullname(e.target.value)}
                            placeholder="John Doe"
                            disabled={user?.auth_provider && user.auth_provider !== 'local'}
                            className={user?.auth_provider && user.auth_provider !== 'local' ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : ''}
                            autoComplete="name"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-email" className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {t(lang, "emailAddr")}
                        </Label>
                        <Input
                            id="edit-email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder="john@example.com"
                            className={error ? "border-red-500" : ""}
                            autoComplete="email"
                        />
                        {error && <p className="text-sm text-red-500">{error}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t(lang, "cancel")}</Button>
                    <Button onClick={handleSave}>{t(lang, "paramsSave")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
