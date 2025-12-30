import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Users, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { t } from "@/lib/constants";

export function GroupManagementDialog({ isOpen, onClose, lang, groups, users, onDeleteGroup, onCreateGroup }) {
    const [groupToDelete, setGroupToDelete] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    const customGroups = groups.filter(r => r.name !== 'admin' && r.name !== 'user');

    // Check if a group is assigned to any user
    const isGroupInUse = (groupName) => {
        return users.some(user => user.groups && user.groups.includes(groupName));
    };

    // Get list of users using a group
    const getUsersUsingGroup = (groupName) => {
        return users.filter(user => user.groups && user.groups.includes(groupName));
    };

    const handleDeleteClick = (groupName) => {
        if (isGroupInUse(groupName)) {
            const usersUsingGroup = getUsersUsingGroup(groupName);
            const usernames = usersUsingGroup.map(u => u.username).join(', ');
            setErrorMessage({
                group: groupName,
                users: usernames,
                count: usersUsingGroup.length
            });
        } else {
            setGroupToDelete(groupName);
        }
    };

    const handleConfirmDelete = () => {
        if (groupToDelete && onDeleteGroup) {
            onDeleteGroup(groupToDelete);
        }
        setGroupToDelete(null);
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            {t(lang, "groupManagement") || "Group Management"}
                        </DialogTitle>
                        <DialogDescription className="hidden">Manage User Groups</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Add Group Button */}
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() => {
                                onCreateGroup();
                                onClose();
                            }}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {t(lang, "addGroup")}
                        </Button>

                        {/* Groups List */}
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">
                                {t(lang, "customGroups") || "Custom Groups"} ({customGroups.length})
                            </div>
                            {customGroups.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
                                    {t(lang, "noCustomGroups") || "No custom groups created yet"}
                                </div>
                            ) : (
                                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {customGroups.map((group) => {
                                        const inUse = isGroupInUse(group.name);
                                        return (
                                            <div
                                                key={group.name}
                                                className="flex items-center justify-between p-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                                            >
                                                <span className="flex items-center gap-2 font-medium">
                                                    <Users className="h-4 w-4 text-purple-500" />
                                                    {group.name}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteClick(group.name)}
                                                    title={t(lang, "deleteGroup") || `Delete group ${group.name}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>
                            {t(lang, "close") || "Close"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t(lang, "deleteGroup") || "Delete Group"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(lang, "deleteGroupConfirmation") || `Are you sure you want to delete the group "${groupToDelete}"?`}
                            <br />
                            {t(lang, "deleteGroupWarning") || "This action cannot be undone. Users assigned to this group will lose this assignment."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t(lang, "cancel") || "Cancel"}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t(lang, "deleteGroup") || "Delete Group"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Error Dialog - Group in use */}
            <AlertDialog open={!!errorMessage} onOpenChange={(open) => !open && setErrorMessage(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            {t(lang, "cannotDeleteGroup") || "Cannot Delete Group"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(lang, "groupInUseError") || `The group "${errorMessage?.group}" cannot be deleted because it is currently assigned to ${errorMessage?.count} user(s):`}
                            <br />
                            <br />
                            <strong>{errorMessage?.users}</strong>
                            <br />
                            <br />
                            {t(lang, "removeGroupFromUsers") || "Please remove this group from all users before deleting it."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t(lang, "close") || "Close"}</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
