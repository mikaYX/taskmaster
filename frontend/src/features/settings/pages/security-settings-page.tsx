import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersList } from '@/features/users';
import { GroupsList } from '@/features/groups';

export function SecuritySettingsPage() {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 max-w-6xl">
            <Tabs defaultValue="users" className="w-full">
                <TabsList variant="line" className="w-full justify-start border-b">
                    <TabsTrigger value="users">{t('settings.usersTab')}</TabsTrigger>
                    <TabsTrigger value="groups">{t('settings.groupsTab')}</TabsTrigger>

                </TabsList>

                <TabsContent value="users" className="mt-6 space-y-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-medium">{t('settings.usersManager')}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {t('settings.usersManagerDescription')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <UsersList embedded />
                </TabsContent>

                <TabsContent value="groups" className="mt-6 space-y-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-medium">{t('settings.groupsManager')}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {t('settings.groupsManagerDescription')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <GroupsList embedded />
                </TabsContent>


            </Tabs>
        </div>
    );
}
