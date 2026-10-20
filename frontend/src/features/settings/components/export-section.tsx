
import { useState } from 'react';
import { AlertTriangle, Download, FileJson, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import { SettingsSection } from './settings-section';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function ExportSection() {
    const { t } = useTranslation();
    const [isGenerating, setIsGenerating] = useState(false);

    const handleExport = async (format: 'json' | 'csv') => {
        setIsGenerating(true);
        try {
            const res = await backupApi.exportData(format);
            toast.success(t('exportSection.generated', { filename: res.filename }), { description: res.path });
            // Trigger download
            // Trigger download using anchor to avoid popup blockers
            const url = backupApi.getDownloadUrl(res.filename);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', res.filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            toast.error(t('exportSection.failed'));
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <SettingsSection title={t('exportSection.title')} description={t('exportSection.description')} icon={FileJson}>
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t('exportSection.warning')}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
                <button
                    type="button"
                    onClick={() => handleExport('json')}
                    disabled={isGenerating}
                    className="flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400">
                        {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileJson className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t('exportSection.formats.json.title')}</span>
                        <span className="block text-xs text-muted-foreground">{t('exportSection.formats.json.description')}</span>
                    </span>
                    <Download className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    disabled={isGenerating}
                    className="flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t('exportSection.formats.csv.title')}</span>
                        <span className="block text-xs text-muted-foreground">{t('exportSection.formats.csv.description')}</span>
                    </span>
                    <Download className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><span className="font-medium text-foreground">{t('exportSection.informationTitle')}</span> {t('exportSection.informationDescription')}</span>
            </p>
        </SettingsSection>
    );
}
