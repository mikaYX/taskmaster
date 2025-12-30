import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/constants";
import { Users, X } from "lucide-react";

export function UserSelectionDialog({ isOpen, onClose, lang, users, selectedUserIds, onSave }) {
    const [tempSelection, setTempSelection] = React.useState([]);

    React.useEffect(() => {
        if (isOpen) {
            setTempSelection([...selectedUserIds]);
        }
    }, [isOpen, selectedUserIds]);

    const handleToggleUser = (userId) => {
        if (tempSelection.includes(userId)) {
            setTempSelection(tempSelection.filter(id => id !== userId));
        } else {
            setTempSelection([...tempSelection, userId]);
        }
    };

    const handleSelectAll = () => {
        if (tempSelection.length === users.length) {
            setTempSelection([]);
        } else {
            setTempSelection(users.map(u => String(u.id)));
        }
    };

    const handleSave = () => {
        onSave(tempSelection);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        {t(lang, "assignTo")}
                    </DialogTitle>
                    <DialogDescription className="hidden">Select Users for Assignment</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {tempSelection.length === 0
                                ? t(lang, "unassigned")
                                : `${tempSelection.length} utilisateur(s) sélectionné(s)`}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAll}
                        >
                            {tempSelection.length === users.length ? "Tout désélectionner" : "Tout sélectionner"}
                        </Button>
                    </div>

                    <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                        {users.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <Users className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">Aucun utilisateur disponible</p>
                            </div>
                        ) : (
                            users.map(user => {
                                const isSelected = tempSelection.includes(String(user.id));
                                return (
                                    <div
                                        key={user.id}
                                        onClick={() => handleToggleUser(String(user.id))}
                                        className={`flex items-center justify-between p-3 cursor-pointer transition-colors hover:bg-accent ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : ''
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected
                                                ? 'bg-primary border-primary'
                                                : 'border-muted-foreground/30'
                                                }`}>
                                                {isSelected && (
                                                    <svg
                                                        className="h-3 w-3 text-primary-foreground"
                                                        fill="none"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth="2"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{user.fullname || user.username}</p>
                                                {user.role && (
                                                    <Badge
                                                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                                                        className="text-xs mt-1"
                                                    >
                                                        {user.role}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {tempSelection.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                            {tempSelection.map(userId => {
                                const user = users.find(u => String(u.id) === userId);
                                return user ? (
                                    <Badge
                                        key={userId}
                                        variant="secondary"
                                        className="flex items-center gap-1 pr-1"
                                    >
                                        {user.fullname || user.username}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleUser(userId);
                                            }}
                                            className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ) : null;
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t(lang, "cancel")}
                    </Button>
                    <Button onClick={handleSave}>
                        {t(lang, "confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
