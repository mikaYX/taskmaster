import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { minuteOptions, nextReminderOffset } from "./reminder-offset";

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

interface ReminderOffsetFieldProps {
    id: string;
    value: number | undefined;
    onChange: (offset: number) => void;
}

export function ReminderOffsetField({ id, value, onChange }: ReminderOffsetFieldProps) {
    const { t } = useTranslation();
    const offset = value ?? 60;
    const hours = Math.floor(offset / 60);
    const minutes = offset % 60;

    return (
        <div className="space-y-2 rounded border p-3" data-testid="reminder-offset">
            <div>
                <div className="text-sm font-medium">{t("taskWizard.notifications.reminderOffset")}</div>
                <p className="text-xs text-muted-foreground">{t("taskWizard.notifications.reminderOffsetHelp")}</p>
            </div>
            <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                    <Label htmlFor={`${id}-hours`} className="text-xs text-muted-foreground">{t("taskWizard.notifications.reminderOffsetHours")}</Label>
                    <Select value={String(hours)} onValueChange={(next) => onChange(nextReminderOffset(Number(next), minutes))}>
                        <SelectTrigger id={`${id}-hours`} className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {HOURS.map((hour) => <SelectItem key={hour} value={String(hour)}>{hour}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`${id}-minutes`} className="text-xs text-muted-foreground">{t("taskWizard.notifications.reminderOffsetMinutes")}</Label>
                    <Select value={String(minutes)} onValueChange={(next) => onChange(nextReminderOffset(hours, Number(next)))}>
                        <SelectTrigger id={`${id}-minutes`} className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {minuteOptions(hours).map((minute) => (
                                <SelectItem key={minute} value={String(minute)}>{String(minute).padStart(2, "0")}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
