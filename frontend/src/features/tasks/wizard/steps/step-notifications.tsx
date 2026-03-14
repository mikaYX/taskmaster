import { useFormContext, useFieldArray } from "react-hook-form";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import { useChannels } from "@/hooks/use-notifications";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Link } from "react-router-dom";
import { AlertCircle, Bell, Mail, Send, Globe } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { groupsApi } from "@/api/groups";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const TypeIcon = ({ type }: { type: string }) => {
    switch (type) {
        case 'EMAIL': return <Mail className="w-5 h-5 text-blue-500" />;
        case 'TEAMS': return <Send className="w-5 h-5 text-indigo-500" />;
        case 'SLACK': return <Send className="w-5 h-5 text-rose-500" />;
        case 'WEBHOOK': return <Globe className="w-5 h-5 text-green-500" />;
        default: return <Bell className="w-5 h-5" />;
    }
}

export function StepNotifications() {
    const { control, watch } = useFormContext<CreateTaskFormValues>();
    const { append, remove } = useFieldArray({
        control,
        name: "notifications",
    });

    const notifications = watch("notifications") || [];

    const { data: channels = [], isLoading: isLoadingChannels } = useChannels(true);

    const { data: users = [], isLoading: isLoadingUsers } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const res = await usersApi.getAll();
            return Array.isArray(res) ? res : [];
        }
    });

    const { data: groups = [], isLoading: isLoadingGroups } = useQuery({
        queryKey: ['groups'],
        queryFn: async () => {
            const res = await groupsApi.getAll();
            return Array.isArray(res) ? res : [];
        }
    });

    if (isLoadingChannels) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    if (channels.length === 0) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Active Channels</AlertTitle>
                <AlertDescription>
                    You don't have any active notification channels configured.
                    <br className="my-1" />
                    To set up alerts, please visit <Link to="/settings" className="underline font-bold">Settings &gt; Notifications</Link> and enable at least one channel.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground mb-4">
                Select the channels you want to use for this task, and configure when alerts should be sent.
            </div>

            {channels.map((channel) => {
                const existingIndex = notifications.findIndex(n => n.channelId === channel.id);
                const isEnabled = existingIndex !== -1;

                return (
                    <Card key={channel.id} className={`border-2 transition-colors ${isEnabled ? 'border-primary' : 'border-transparent dark:border-border'}`}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="flex items-center space-x-3">
                                <TypeIcon type={channel.type} />
                                <div>
                                    <CardTitle className="text-base">{channel.name}</CardTitle>
                                    <CardDescription className="text-xs">{channel.type}</CardDescription>
                                </div>
                            </div>
                            <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        append({
                                            channelId: channel.id,
                                            notifyOnFailed: true,
                                            notifyOnMissing: true,
                                            notifyOnReminder: false,
                                            emailUserIds: [],
                                            emailGroupIds: [],
                                            emailCustom: []
                                        });
                                    } else {
                                        remove(existingIndex);
                                    }
                                }}
                            />
                        </CardHeader>
                        {isEnabled && (
                            <CardContent className="pt-4 space-y-4 border-t">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField
                                        control={control}
                                        name={`notifications.${existingIndex}.notifyOnFailed`}
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded">
                                                <FormControl>
                                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>On Failure</FormLabel>
                                                    <FormDescription className="text-xs">Notify when task fails</FormDescription>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name={`notifications.${existingIndex}.notifyOnMissing`}
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded">
                                                <FormControl>
                                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>On Missing</FormLabel>
                                                    <FormDescription className="text-xs">Notify if missed</FormDescription>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name={`notifications.${existingIndex}.notifyOnReminder`}
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded">
                                                <FormControl>
                                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>Reminder</FormLabel>
                                                    <FormDescription className="text-xs">Remind before due</FormDescription>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {channel.type === 'EMAIL' && (
                                    <div className="space-y-4 pt-2">
                                        <div className="text-sm font-medium">Email Recipients</div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Users Selection */}
                                            <div className="space-y-2">
                                                <FormLabel className="text-xs text-muted-foreground">Select Users</FormLabel>
                                                <ScrollArea className="h-32 border rounded p-2">
                                                    {isLoadingUsers ? <Skeleton className="h-full w-full" /> : users.map(user => (
                                                        <FormField
                                                            key={user.id}
                                                            control={control}
                                                            name={`notifications.${existingIndex}.emailUserIds`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex flex-row items-start space-x-2 space-y-0 py-1">
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.includes(user.id)}
                                                                            onCheckedChange={(checked) => {
                                                                                const current = field.value || [];
                                                                                field.onChange(checked
                                                                                    ? [...current, user.id]
                                                                                    : current.filter(id => id !== user.id)
                                                                                );
                                                                            }}
                                                                        />
                                                                    </FormControl>
                                                                    <FormLabel className="font-normal text-sm cursor-pointer">{user.fullname || user.username}</FormLabel>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    ))}
                                                </ScrollArea>
                                            </div>

                                            {/* Groups Selection */}
                                            <div className="space-y-2">
                                                <FormLabel className="text-xs text-muted-foreground">Select Groups</FormLabel>
                                                <ScrollArea className="h-32 border rounded p-2">
                                                    {isLoadingGroups ? <Skeleton className="h-full w-full" /> : groups.map(group => (
                                                        <FormField
                                                            key={group.id}
                                                            control={control}
                                                            name={`notifications.${existingIndex}.emailGroupIds`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex flex-row items-start space-x-2 space-y-0 py-1">
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.includes(group.id)}
                                                                            onCheckedChange={(checked) => {
                                                                                const current = field.value || [];
                                                                                field.onChange(checked
                                                                                    ? [...current, group.id]
                                                                                    : current.filter(id => id !== group.id)
                                                                                );
                                                                            }}
                                                                        />
                                                                    </FormControl>
                                                                    <FormLabel className="font-normal text-sm cursor-pointer">{group.name}</FormLabel>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    ))}
                                                </ScrollArea>
                                            </div>
                                        </div>

                                        {/* Custom Emails */}
                                        <FormField
                                            control={control}
                                            name={`notifications.${existingIndex}.emailCustom`}
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Custom Emails (comma separated)</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="admin@example.com, manager@example.com"
                                                                defaultValue={field.value?.join(', ') || ''}
                                                                onBlur={(e) => {
                                                                    const raw = e.target.value;
                                                                    const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
                                                                    field.onChange(arr);
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )
                                            }}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}
