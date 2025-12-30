import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/constants";
import { UserX, AlertTriangle, Users, User, ArrowRight, CalendarClock, Briefcase } from "lucide-react";

export function ReassignUserDialog({ isOpen, onClose, tasks, users, groups, onConfirm, deletedUserName, lang }) {
    const [targetType, setTargetType] = useState('user'); // user | group
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');

    const handleConfirm = () => {
        if (targetType === 'user' && !selectedUser) return;
        if (targetType === 'group' && !selectedGroup) return;
        onConfirm({
            newUserId: targetType === 'user' ? selectedUser : null,
            newGroupId: targetType === 'group' ? selectedGroup : null
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[550px] gap-6">
                <DialogHeader className="gap-2">
                    <DialogTitle className="flex items-center gap-2 text-xl text-destructive">
                        <div className="p-2 bg-destructive/10 rounded-full">
                            <UserX className="h-6 w-6" />
                        </div>
                        {t(lang, "reassignTitle")}
                    </DialogTitle>
                    <DialogDescription className="text-base pt-2">
                        {t(lang, "reassignIntro")}
                        <div className="mt-2 flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-md font-medium text-slate-900 dark:text-slate-100">
                            <span className="text-muted-foreground mr-1">{t(lang, "username")}:</span>
                            {deletedUserName}
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-primary" />
                            {tasks.length} {tasks.length > 1 ? "tâches concernées" : "tâche concernée"} (futures)
                        </div>
                        <div className="max-h-[120px] overflow-y-auto rounded-md border bg-muted/50 p-2 space-y-1">
                            {tasks.map(t => (
                                <div key={t.id} className="text-sm flex items-start gap-2 p-1.5 bg-background rounded border shadow-sm">
                                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-mono mt-0.5">
                                        #{t.id}
                                    </span>
                                    <span className="line-clamp-1">{t.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="text-sm font-medium flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-primary" />
                            {t(lang, "assignTo")}
                        </div>

                        <Tabs defaultValue="user" value={targetType} onValueChange={setTargetType} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="user" className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    {t(lang, "reassignToUser")}
                                </TabsTrigger>
                                <TabsTrigger value="group" className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    {t(lang, "reassignToGroup")}
                                </TabsTrigger>
                            </TabsList>
                            <div className="mt-4 p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50">
                                <TabsContent value="user" className="mt-0 space-y-3">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                        <ArrowRight className="h-4 w-4" />
                                        <span>Sélectionnez le nouveau responsable :</span>
                                    </div>
                                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                                        <SelectTrigger id="reassign-user-select" className="w-full bg-background" aria-label="Choisir un utilisateur">
                                            <SelectValue placeholder="Choisir un utilisateur..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {users.filter(u => u.username !== deletedUserName).map(u => (
                                                <SelectItem key={u.id} value={String(u.id)}>
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3 w-3 text-muted-foreground" />
                                                        {u.username}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TabsContent>
                                <TabsContent value="group" className="mt-0 space-y-3">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                        <ArrowRight className="h-4 w-4" />
                                        <span>Sélectionnez le groupe responsable :</span>
                                    </div>
                                    <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                                        <SelectTrigger id="reassign-group-select" className="w-full bg-background" aria-label="Choisir un groupe">
                                            <SelectValue placeholder="Choisir un groupe..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {groups.map(g => (
                                                <SelectItem key={g.name} value={g.name}>
                                                    <div className="flex items-center gap-2">
                                                        <Users className="h-3 w-3 text-muted-foreground" />
                                                        {g.name}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>
                        {t(lang, "cancel")}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        variant="destructive"
                        disabled={(targetType === 'user' && !selectedUser) || (targetType === 'group' && !selectedGroup)}
                        className="gap-2"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        {t(lang, "reassignConfirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
