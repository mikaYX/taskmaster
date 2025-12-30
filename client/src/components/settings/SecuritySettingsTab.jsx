import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPlus, Key, Server, Trash2, Check, User as UserIcon, Users, Shield, Database } from 'lucide-react';
import { t } from "@/lib/constants";

export function SecuritySettingsTab({
    lang,
    users,
    setUsers,
    availableGroups,
    setShowGroupManagement,
    setShowAuthManagement,
    setShowAddUserDialog,
    setEditPwdIndex,
    setEditDetailsIndex,
    setUserToDelete
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-4">
                {/* Header with Add User and Manage Groups buttons */}
                <div className="flex items-center justify-between">
                    <Label>{t(lang, "teamMembers")}</Label>
                    <div className="flex items-center gap-2">
                        <Button type="button" size="icon" onClick={() => setShowAddUserDialog(true)} title={t(lang, "addUser")}>
                            <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" onClick={() => setShowGroupManagement(true)} title={t(lang, "manageGroups") || "Manage Groups"}>
                            <Users className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" onClick={() => setShowAuthManagement(true)} title={t(lang, "authTab") || "Authentication"}>
                            <Shield className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Users List */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {users.map((u, i) => (
                        <div key={u.id || `new-${i}`} className="flex gap-2 items-center p-1.5">
                            {/* Username with Auth Provider Badge */}
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="Username"
                                        value={u.username}
                                        disabled={true} // Always disabled here, editable in details
                                        className="bg-slate-100 dark:bg-slate-800 text-muted-foreground opacity-100" // Force styling to look "grayed out" but readable
                                        aria-label={`Username for user ${u.username}`}
                                    />
                                    {/* Local Badge */}
                                    {(!u.auth_provider || u.auth_provider === 'local') && (
                                        <div title="Local Account" className="p-1 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                            <Database className="h-4 w-4" />
                                        </div>
                                    )}
                                    {/* Azure Badge */}
                                    {u.auth_provider === 'azure' && (
                                        <div title="Azure Active Directory" className="p-1 rounded-sm bg-slate-100 dark:bg-slate-800">
                                            <svg width="16" height="16" viewBox="0 0 23 23" className="block">
                                                <path fill="#f35325" d="M1 1h10v10H1z" />
                                                <path fill="#81bc06" d="M12 1h10v10H1z" />
                                                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                                                <path fill="#ffba08" d="M12 12h10v10H1z" />
                                            </svg>
                                        </div>
                                    )}
                                    {/* LDAP Badge */}
                                    {u.auth_provider === 'ldap' && (
                                        <div title="LDAP / Active Directory" className="p-1 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                            <Server className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Role Selector (Admin/User) */}
                            <div className="w-24">
                                <Select value={u.groups && u.groups.includes('admin') ? 'admin' : 'user'} onValueChange={(v) => {
                                    const n = users.map((user, idx) => {
                                        if (idx !== i) return user;
                                        if (v === 'admin') {
                                            return { ...user, groups: ['admin'], role: 'admin' };
                                        } else {
                                            let g = user.groups ? [...user.groups] : [];
                                            g = g.filter(x => x !== 'admin');
                                            if (!g.includes('user')) g.push('user');
                                            return { ...user, groups: g, role: 'user' };
                                        }
                                    });
                                    setUsers(n);
                                }} disabled={u.username === 'admin' || u.id === 1}>
                                    <SelectTrigger aria-label={`Role for user ${u.username}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Admin</SelectItem>
                                        <SelectItem value="user">User</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Password Button */}
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                title={u.auth_provider && u.auth_provider !== 'local' ? "Managed by external provider" : (u.password ? "Password set (modified)" : (u.id ? t(lang, "changePassword") : t(lang, "setPassword")))}
                                className={u.password ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20" : "text-muted-foreground"}
                                disabled={!!(u.auth_provider && u.auth_provider !== 'local')}
                                onClick={() => setEditPwdIndex(i)}
                            >
                                <Key className="h-4 w-4" />
                            </Button>

                            {/* User Details Button */}
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                title={t(lang, "editUserDetails")}
                                onClick={() => setEditDetailsIndex(i)}
                                className={u.fullname || u.email ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20" : "text-muted-foreground"}
                            >
                                <UserIcon className="h-4 w-4" />
                            </Button>

                            {/* Groups Popover */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        title="Manage Groups"
                                        className={u.groups && u.groups.filter(g => g !== 'admin' && g !== 'user').length > 0 ? "border-purple-500 text-purple-600" : ""}
                                    >
                                        <Users className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="end">
                                    <div className="p-1">
                                        {availableGroups.filter(r => r.name !== 'admin' && r.name !== 'user').length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-2">No custom groups</p>
                                        )}
                                        {availableGroups.filter(r => r.name !== 'admin' && r.name !== 'user').map((role) => {
                                            const isSelected = u.groups ? u.groups.includes(role.name) : false;
                                            return (
                                                <div
                                                    key={role.name}
                                                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        let newGroups = u.groups ? [...u.groups] : [];
                                                        if (isSelected) {
                                                            newGroups = newGroups.filter(g => g !== role.name);
                                                        } else {
                                                            newGroups.push(role.name);
                                                        }
                                                        const n = users.map((user, idx) =>
                                                            idx === i
                                                                ? { ...user, groups: newGroups, role: newGroups.includes('admin') ? 'admin' : 'user' }
                                                                : user
                                                        );
                                                        setUsers(n);
                                                    }}
                                                >
                                                    <div className={`flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                                                        <Check className="h-3 w-3" />
                                                    </div>
                                                    <span className="flex-1">{role.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Delete Button (only if more than 1 user) */}
                            {users.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setUserToDelete({ index: i, user: u })}
                                    disabled={u.username === 'admin' || u.id === 1} // Protect default admin
                                    title={(u.username === 'admin' || u.id === 1) ? "Default admin cannot be deleted" : t(lang, "deleteUser")}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
