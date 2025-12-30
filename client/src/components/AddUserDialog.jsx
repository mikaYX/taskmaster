import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/lib/constants";
import { Server, Dices } from "lucide-react";

const MicrosoftIcon = () => (
    <svg width="16" height="16" viewBox="0 0 23 23" className="inline-block mr-2">
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H1z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H1z" />
    </svg>
);

export function AddUserDialog({
    isOpen,
    onClose,
    onSave,
    authAzureEnabled,
    authLdapEnabled,
    lang = "EN"
}) {
    const [provider, setProvider] = useState('local');
    const [username, setUsername] = useState('');
    const [fullname, setFullname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setProvider('local');
            setUsername('');
            setFullname('');
            setEmail('');
            setPassword('');
            setError('');
        }
    }, [isOpen]);

    const generatePassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
        let p = "";
        for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
        setPassword(p);
    };

    const handleSave = () => {
        setError('');

        // Validation logic
        // Full Name is required only for Local accounts (Azure/LDAP will fetch it automatically)
        if (provider === 'local' && !fullname.trim()) {
            setError(t(lang, "fullName") + " is required.");
            return;
        }

        if (provider === 'local') {
            if (!username.trim()) {
                setError(t(lang, "username") + " is required.");
                return;
            }
            if (!password) {
                setError((t(lang, "newPwd") || "Password") + " is required for local accounts."); // Reusing smtpPass as "Password" label
                return;
            }
        } else {
            // Azure / LDAP
            if (!email.trim()) {
                setError(t(lang, "emailAddr") + " is required for external authentication.");
                return;
            }
        }

        // Construct access object
        // For external providers, username might be email or derived.
        // If username is empty for external, use email.
        const finalUsername = username.trim() || email.trim();

        onSave({
            username: finalUsername,
            fullname: fullname.trim(),
            email: email.trim(),
            password: password, // Only used if provider is local
            auth_provider: provider,
            must_change_password: provider === 'local', // Force change for local users
            groups: ['user'] // Default group
        });
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t(lang, "addUser")}</DialogTitle>
                    <DialogDescription className="hidden">Create New User Account</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Provider Selection */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-left break-words">
                            {t(lang, "source") || "Source"}
                        </Label>
                        <Select value={provider} onValueChange={setProvider}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select Source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="local">Local Database</SelectItem>
                                {authAzureEnabled && (
                                    <SelectItem value="azure">
                                        <div className="flex items-center">
                                            <MicrosoftIcon /> Azure Active Directory
                                        </div>
                                    </SelectItem>
                                )}
                                {authLdapEnabled && (
                                    <SelectItem value="ldap">
                                        <div className="flex items-center">
                                            <Server className="w-4 h-4 mr-2" /> LDAP / Active Directory
                                        </div>
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Full Name (Required for Local only) */}
                    {provider === 'local' && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="fullname" className="text-left break-words">
                                {t(lang, "fullName")} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="fullname"
                                value={fullname}
                                onChange={(e) => setFullname(e.target.value)}
                                className="col-span-3"
                                placeholder="John Doe"
                                autoComplete="name"
                            />
                        </div>
                    )}

                    {/* Email (Required for External, Optional for Local) */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="email" className="text-left break-words">
                            {t(lang, "emailAddr")} {provider !== 'local' && <span className="text-red-500">*</span>}
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="col-span-3"
                            placeholder="john@example.com"
                            autoComplete="email"
                        />
                    </div>

                    {/* Username (Required for Local, Auto for External if empty) */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="username" className="text-left break-words">
                            {t(lang, "username")} {provider === 'local' && <span className="text-red-500">*</span>}
                        </Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="col-span-3"
                            placeholder={provider !== 'local' ? "Optional (defaults to Email)" : "username"}
                            autoComplete="username"
                        />
                    </div>

                    {/* Password (Required for Local only) */}
                    {provider === 'local' && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="password" className="text-left break-words">
                                {t(lang, "newPwd") || "Password"} <span className="text-red-500">*</span>
                            </Label>
                            <div className="col-span-3 flex gap-2">
                                <Input
                                    id="password"
                                    type="text"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="flex-1"
                                    placeholder="8+ chars"
                                    autoComplete="new-password"
                                />
                                <Button type="button" variant="outline" size="icon" title="Generate Random" onClick={generatePassword}>
                                    <Dices className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-red-500 text-center">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t(lang, "cancel")}</Button>
                    <Button onClick={handleSave}>{t(lang, "confirm")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
