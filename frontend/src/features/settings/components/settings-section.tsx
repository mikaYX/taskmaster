import type { ReactNode } from 'react';

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';

interface SettingsSectionProps {
    title: string;
    description?: string;
    children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}
