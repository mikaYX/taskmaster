
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileJson, FileSpreadsheet, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';

export function ExportSection() {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleExport = async (format: 'json' | 'csv') => {
        setIsGenerating(true);
        try {
            const res = await backupApi.exportData(format);
            toast.success(`Export generated: ${res.filename}`);
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
            toast.error('Export failed');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Card className="border-blue-100 dark:border-blue-900/50">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-blue-500" />
                    <CardTitle>Business Data Export</CardTitle>
                </div>
                <CardDescription>
                    Export portable business data (Users, Tasks, Groups) for analysis or migration.
                    <br />
                    <span className="text-yellow-600 dark:text-yellow-500 font-medium">
                        Not a full system backup. Does not include configuration or secrets.
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                    <Button
                        variant="outline"
                        onClick={() => handleExport('json')}
                        disabled={isGenerating}
                        className="flex-1 h-auto py-4 justify-start"
                    >
                        <FileJson className="mr-3 h-5 w-5 text-muted-foreground" />
                        <div className="text-left">
                            <div className="font-semibold">JSON Format</div>
                            <div className="text-xs text-muted-foreground">Structured data, best for developers</div>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => handleExport('csv')}
                        disabled={isGenerating}
                        className="flex-1 h-auto py-4 justify-start"
                    >
                        <FileSpreadsheet className="mr-3 h-5 w-5 text-muted-foreground" />
                        <div className="text-left">
                            <div className="font-semibold">CSV / Excel</div>
                            <div className="text-xs text-muted-foreground">Flat lists, best for reporting</div>
                        </div>
                    </Button>
                </div>

                <Alert className="mt-4 bg-blue-50/50 dark:bg-blue-950/20 border-none">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertTitle>Information</AlertTitle>
                    <AlertDescription className="text-xs text-muted-foreground">
                        Exports are generated on demand and are not encrypted by default as they contain no system secrets.
                    </AlertDescription>
                </Alert>
            </CardContent>
        </Card>
    );
}
