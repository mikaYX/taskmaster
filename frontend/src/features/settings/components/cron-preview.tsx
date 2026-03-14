import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarClock, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { settingsApi } from '@/api/settings';

interface CronPreviewProps {
    expression: string;
    className?: string;
    count?: number; // Count is ignored by API currently (API specific) but good to keep prop
}

export function CronPreview({ expression, className }: CronPreviewProps) {
    const { t } = useTranslation();
    const [debouncedExpression, setDebouncedExpression] = useState(expression);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedExpression(expression);
        }, 500);
        return () => clearTimeout(handler);
    }, [expression]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['cron-preview', debouncedExpression],
        queryFn: () => settingsApi.cronPreview(debouncedExpression),
        enabled: !!debouncedExpression && debouncedExpression.length > 4,
        retry: false,
    });

    if (!expression) return null;

    return (
        <Card className={cn("mt-4", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {t('scheduler.nextRuns')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            {t('scheduler.cronError')}
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-1">
                        {(data?.nextRuns || data?.nextExecutions || []).map((dateStr, index) => {
                            const date = new Date(dateStr);
                            return (
                                <div key={index} className="flex items-center text-sm">
                                    <Badge variant="outline" className="mr-2 w-6 justify-center text-xs text-muted-foreground">
                                        {index + 1}
                                    </Badge>
                                    <span className="text-muted-foreground w-24 text-xs">
                                        {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </span>
                                    <ArrowRight className="h-3 w-3 mx-2 text-muted-foreground/50" />
                                    <span className="font-medium font-mono text-xs">
                                        {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })}
                        <p className="text-[10px] text-muted-foreground pt-2 italic">
                            {t('scheduler.serverTimeNote')}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
