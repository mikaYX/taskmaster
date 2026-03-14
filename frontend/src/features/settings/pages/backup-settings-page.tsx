
import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSettings } from '../hooks/use-settings';
import { backupSettingsSchema } from '../schemas/settings-schemas';
import { z } from 'zod';

type BackupSettingsFormValues = z.infer<typeof backupSettingsSchema>;
import { Form } from "@/components/ui/form";
import { Button } from '@/components/ui/button';
import { Loader2, Save, AlertTriangle, ShieldAlert } from 'lucide-react';
import { backupApi } from '@/api/backup';
import type { BackupFile } from '@/api/backup';

// Components
import { BackupHeader } from '../components/backup-header';
import { ExportSection } from '../components/export-section';
import { BackupSchedule } from '../components/backup-schedule';
import { BackupHistoryTable } from '../components/backup-history';
import { RestoreZone } from '../components/restore-zone';
import type { RestoreZoneRef } from '../components/restore-zone';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function BackupSettingsPage() {
    const { settings, getSetting, getSettingAsBool, updateSettings, isLoading: isSettingsLoading, isUpdating } = useSettings();
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [statusData, setStatusData] = useState<{ encryptionKeyPresent: boolean; encryptionKeyIsDefault: boolean; timezone: string } | null>(null);

    // Restore zone state
    const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupFile | null>(null);
    const restoreZoneRef = useRef<RestoreZoneRef>(null);

    const form = useForm<BackupSettingsFormValues>({
        resolver: zodResolver(backupSettingsSchema),
        defaultValues: {
            enabled: false,
            scheduleType: 'daily' as 'daily' | 'weekly' | 'custom',
            dayOfWeek: 1,
            time: '03:00',
            cron: '0 3 * * *',
            type: 'zip' as 'json' | 'zip',
            encryption: {
                password: '',
            },
            retention: {
                count: 10,
            },
            path: './backups',
        },
    });

    // Detect dirty state
    const isDirty = form.formState.isDirty;

    // Fetch History & Status
    const fetchBackups = async () => {
        try {
            const [listRes, statusRes] = await Promise.all([
                backupApi.list(),
                backupApi.getStatus()
            ]);
            setBackups(listRes);
            setStatusData(statusRes);
        } catch (e) {
            console.error('Failed to load backup data', e);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleRefresh = () => {
        fetchBackups();
        // Long poll after 5 seconds to catch async job results
        setTimeout(() => fetchBackups(), 5000);
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    // Sync Settings to Form
    useEffect(() => {
        if (settings && settings.length > 0 && !form.formState.isDirty) {
            form.reset({
                enabled: getSettingAsBool('backup.enabled'),
                scheduleType: getSetting<'daily' | 'weekly' | 'custom'>('backup.scheduleType') || 'daily',
                dayOfWeek: Number(getSetting('backup.dayOfWeek') ?? 1),
                cron: getSetting('backup.cron') || '0 3 * * *',
                time: getSetting('backup.time') || '03:00',
                type: getSetting<'json' | 'zip'>('backup.type') || 'zip',
                encryption: {
                    password: getSetting('backup.encryption.password') || '',
                },
                retention: {
                    count: Number(getSetting('backup.retention.count') ?? 10),
                },
                path: getSetting('backup.path') || './backups',
            });
        }
    }, [settings, form, getSetting, getSettingAsBool]); // settings is stable from hook, simplified dep


    const onSubmit = (data: BackupSettingsFormValues) => {
        const payload: Record<string, unknown> = {
            'backup.enabled': data.enabled,
            'backup.scheduleType': data.scheduleType,
            'backup.dayOfWeek': data.dayOfWeek,
            'backup.time': data.time,
            'backup.cron': data.cron,
            'backup.type': data.type,
            'backup.retention.count': data.retention.count,
            'backup.path': data.path,
        };

        if (data.encryption.password) {
            payload['backup.encryption.password'] = data.encryption.password;
        }

        updateSettings(payload);
        form.reset(data);
    };

    // Handle restore selection from backup history
    const handleRestoreBackup = (backup: BackupFile) => {
        setSelectedBackupForRestore(backup);
        // Small delay to ensure state is set before scrolling
        setTimeout(() => {
            restoreZoneRef.current?.scrollIntoView();
        }, 100);
    };

    // Calculate Status for Header
    // Status reflects SAVED state (from settings), not form state
    const savedEnabled = getSettingAsBool('backup.enabled');

    const status = {
        lastBackupAt: backups && backups.length > 0 ? new Date(backups[0].createdAt) : null,
        lastBackupStatus: backups && backups.length > 0 ? 'SUCCESS' : null as 'SUCCESS' | null,
        storagePath: getSetting('backup.path') || './backups',
        nextRunAt: savedEnabled ? new Date() : null, // Would need cron parser to be accurate
    };

    if (isSettingsLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="space-y-8 max-w-6xl pb-20">
            {/* ZONE A: Header */}
            <BackupHeader status={status} isLoading={isHistoryLoading} />

            {/* ZONE B: Exports */}
            <section className="space-y-4">
                <h3 className="text-lg font-medium">Export de Données (Portable)</h3>
                <ExportSection />
            </section>

            {/* ZONE C: System Backups (Schedule + History) */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Sauvegardes Système (Recovery)</h3>
                    {!isDirty && (
                        <Button onClick={form.handleSubmit(onSubmit)} disabled={isUpdating} variant="outline">
                            <Save className="mr-2 h-4 w-4" />
                            Save Config
                        </Button>
                    )}
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <BackupSchedule form={form} />
                    </form>
                </Form>

                {/* ALERT: SECURITY KEY WARNING */}
                {statusData?.encryptionKeyIsDefault && (
                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle className="font-bold">Risque de Sécurité Critique</AlertTitle>
                        <AlertDescription className="text-sm">
                            Votre clé de chiffrement des sauvegardes (<strong>BACKUP_ENCRYPTION_KEY</strong>) est actuellement définie sur une valeur par défaut non sécurisée.
                            Toutes vos sauvegardes chiffrées sont vulnérables. <strong>Veuillez générer une nouvelle clé aléatoire de 32 caractères minimum dans votre fichier .env</strong>
                        </AlertDescription>
                    </Alert>
                )}

                {/* ALERT: UNSAVED CHANGES (Moved here for visibility during config) */}
                {isDirty && (
                    <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50" variant="default">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <AlertTitle className="text-yellow-800 dark:text-yellow-200">Unsaved Changes Detected</AlertTitle>
                        <AlertDescription className="flex items-center justify-between">
                            <span className="text-yellow-700 dark:text-yellow-300">You have modified backup configurations. Please save before running manual backups.</span>
                            <Button size="sm" onClick={form.handleSubmit(onSubmit)} disabled={isUpdating} className="bg-yellow-600 hover:bg-yellow-700 text-white dark:bg-yellow-700 dark:hover:bg-yellow-600">
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                Save Now
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                <div className="pt-4">
                    <BackupHistoryTable
                        backups={backups}
                        onRefresh={handleRefresh}
                        canRunFull={!!statusData?.encryptionKeyPresent}
                        isDirty={isDirty}
                        onRestore={handleRestoreBackup}
                    />
                </div>
            </section>

            {/* ZONE D: Restore */}
            <section className="space-y-4 pt-8">
                <RestoreZone
                    ref={restoreZoneRef}
                    selectedBackup={selectedBackupForRestore}
                    onSelectBackup={setSelectedBackupForRestore}
                    backups={backups}
                    onRefreshBackups={handleRefresh}
                />
            </section>
        </div>
    );
}
