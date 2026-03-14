import { useFormContext } from "react-hook-form";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { groupsApi } from "@/api/groups";
import { Skeleton } from "@/components/ui/skeleton";


export function StepAssignment() {
    const { control, watch } = useFormContext<CreateTaskFormValues>();
    const userIds = watch("userIds") || [];
    const groupIds = watch("groupIds") || [];

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

    return (
        <div className="space-y-6">
            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="users">Users ({userIds.length})</TabsTrigger>
                    <TabsTrigger value="groups">Groups ({groupIds.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="border rounded-md p-4 min-h-[200px]">
                    <FormField
                        control={control}
                        name="userIds"
                        render={() => (
                            <FormItem>
                                <div className="mb-4">
                                    <FormLabel className="text-base">Assign to Users</FormLabel>
                                </div>
                                <ScrollArea className="h-[200px]">
                                    {isLoadingUsers ? (
                                        <div className="space-y-2 p-2">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                        </div>
                                    ) : users.length === 0 ? (
                                        <div className="p-4 text-center text-muted-foreground text-sm">
                                            No users found.
                                        </div>
                                    ) : (
                                        users.map((user) => (
                                            <FormField
                                                key={user.id}
                                                control={control}
                                                name="userIds"
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={user.id}
                                                            className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 mb-2"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(user.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? field.onChange([...field.value, user.id])
                                                                            : field.onChange(
                                                                                field.value?.filter(
                                                                                    (value) => value !== user.id
                                                                                )
                                                                            )
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal cursor-pointer flex-1">
                                                                {user.fullname || user.username}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        )))}
                                </ScrollArea>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </TabsContent>

                <TabsContent value="groups" className="border rounded-md p-4 min-h-[200px]">
                    <FormField
                        control={control}
                        name="groupIds"
                        render={() => (
                            <FormItem>
                                <div className="mb-4">
                                    <FormLabel className="text-base">Assign to Groups</FormLabel>
                                </div>
                                <ScrollArea className="h-[200px]">
                                    {isLoadingGroups ? (
                                        <div className="space-y-2 p-2">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                        </div>
                                    ) : groups.length === 0 ? (
                                        <div className="p-4 text-center text-muted-foreground text-sm">
                                            No groups found.
                                        </div>
                                    ) : (
                                        groups.map((group) => (
                                            <FormField
                                                key={group.id}
                                                control={control}
                                                name="groupIds"
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={group.id}
                                                            className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 mb-2"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(group.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? field.onChange([...field.value, group.id])
                                                                            : field.onChange(
                                                                                field.value?.filter(
                                                                                    (value) => value !== group.id
                                                                                )
                                                                            )
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal cursor-pointer flex-1">
                                                                {group.name}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        )))}
                                </ScrollArea>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
