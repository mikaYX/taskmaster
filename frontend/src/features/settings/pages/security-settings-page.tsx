import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersList } from '@/features/users';
import { GroupsList } from '@/features/groups';
import { Users, UsersRound } from 'lucide-react';

export function SecuritySettingsPage() {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <Tabs defaultValue="users" className="w-full">
                <TabsList className="h-10">
                    <TabsTrigger value="users" className="gap-2 px-4">
                        <Users className="h-4 w-4" />
                        {t('settings.usersTab')}
                    </TabsTrigger>
                    <TabsTrigger value="groups" className="gap-2 px-4">
                        <UsersRound className="h-4 w-4" />
                        {t('settings.groupsTab')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="mt-6 space-y-4">
                    <UsersList embedded />
                </TabsContent>

                <TabsContent value="groups" className="mt-6 space-y-4">
                    <GroupsList embedded />
                </TabsContent>


            </Tabs>
        </div>
    );
}
