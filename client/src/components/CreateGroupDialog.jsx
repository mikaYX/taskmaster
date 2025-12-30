import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";
import { Users } from "lucide-react";

export function CreateGroupDialog({ isOpen, onClose, lang, onGroupCreated }) {
    const [groupName, setGroupName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const trimmed = groupName.trim();
        if (!trimmed) {
            setError("Le nom du groupe est requis");
            return;
        }

        if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
            setError("Utilisez uniquement des lettres, chiffres, espaces, tirets et underscores");
            return;
        }

        if (trimmed.toLowerCase() === 'admin' || trimmed.toLowerCase() === 'user') {
            setError("Ce nom est réservé");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/roles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('checklist_auth_token')
                },
                body: JSON.stringify({ name: trimmed })
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Erreur lors de la création du groupe");
                return;
            }

            onGroupCreated(data);
            setGroupName("");
            onClose();
        } catch (err) {
            setError("Erreur réseau");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setGroupName("");
        setError("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        {t(lang, "addGroup")}
                    </DialogTitle>
                    <DialogDescription className="hidden">Create New User Group</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="group-name">{t(lang, "typeGroupname")}</Label>
                        <Input
                            id="group-name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder={t(lang, "groupNamePlaceholder")}
                            autoFocus
                            maxLength={50}
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            Ex: Managers, Techniciens, Superviseurs, etc.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-md">
                            {error}
                        </div>
                    )}

                    <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-1">
                        <p className="font-medium">ℹ️ Informations</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>"Admin" et "User" sont des groupes système non modifiables</li>
                            <li>Vous pourrez assigner ce groupe à des utilisateurs</li>
                            <li>Un groupe ne peut être supprimé que s'il n'est assigné à aucun utilisateur</li>
                        </ul>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                            {t(lang, "cancel")}
                        </Button>
                        <Button type="submit" disabled={loading || !groupName.trim()}>
                            {loading ? "..." : t(lang, "create")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
