import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, UserPlus, Mail, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecipientSelectorProps {
    recipients: string[];
    setRecipients: Dispatch<SetStateAction<string[]>>;
    label?: string;
    showAssigned?: boolean; // If false, hide "Assigned Users" option (for exports)
    customEmails?: string;
    setCustomEmails?: Dispatch<SetStateAction<string>>;
}

const RECIPIENT_OPTIONS = {
    ADMIN: 'Admin',
    ASSIGNED: 'Assigned',
    CUSTOM: 'Custom',
} as const;

export function RecipientSelector({
    recipients,
    setRecipients,
    label,
    showAssigned = true,
    customEmails = '',
    setCustomEmails,
}: RecipientSelectorProps) {
    const { t } = useTranslation();

    const toggleRecipient = (recipient: string) => {
        if (recipients.includes(recipient)) {
            setRecipients(recipients.filter((r) => r !== recipient));
        } else {
            setRecipients([...recipients, recipient]);
        }
    };

    const isSelected = (recipient: string) => recipients.includes(recipient);

    return (
        <div className="space-y-3">
            {label && <Label>{label}</Label>}

            {/* Recipient Buttons */}
            <div className="flex flex-wrap gap-2">
                {/* Admin */}
                <Button
                    type="button"
                    variant={isSelected(RECIPIENT_OPTIONS.ADMIN) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleRecipient(RECIPIENT_OPTIONS.ADMIN)}
                    className={cn('gap-2', isSelected(RECIPIENT_OPTIONS.ADMIN) && 'pr-3')}
                >
                    <Users className="h-4 w-4" />
                    {t('recipients.admin')}
                    {isSelected(RECIPIENT_OPTIONS.ADMIN) && <Check className="h-3 w-3" />}
                </Button>

                {/* Assigned Users (conditional) */}
                {showAssigned && (
                    <Button
                        type="button"
                        variant={isSelected(RECIPIENT_OPTIONS.ASSIGNED) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleRecipient(RECIPIENT_OPTIONS.ASSIGNED)}
                        className={cn('gap-2', isSelected(RECIPIENT_OPTIONS.ASSIGNED) && 'pr-3')}
                    >
                        <UserPlus className="h-4 w-4" />
                        {t('recipients.assigned')}
                        {isSelected(RECIPIENT_OPTIONS.ASSIGNED) && <Check className="h-3 w-3" />}
                    </Button>
                )}

                {/* Custom */}
                <Button
                    type="button"
                    variant={isSelected(RECIPIENT_OPTIONS.CUSTOM) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleRecipient(RECIPIENT_OPTIONS.CUSTOM)}
                    className={cn('gap-2', isSelected(RECIPIENT_OPTIONS.CUSTOM) && 'pr-3')}
                >
                    <Mail className="h-4 w-4" />
                    {t('recipients.custom')}
                    {isSelected(RECIPIENT_OPTIONS.CUSTOM) && <Check className="h-3 w-3" />}
                </Button>
            </div>

            {/* Custom Emails Input (conditional) */}
            {isSelected(RECIPIENT_OPTIONS.CUSTOM) && setCustomEmails && (
                <div className="space-y-2 pt-2">
                    <Label htmlFor="custom-emails">{t('recipients.customEmails')}</Label>
                    <Input
                        id="custom-emails"
                        type="text"
                        value={customEmails}
                        onChange={(e) => setCustomEmails(e.target.value)}
                        placeholder="email1@example.com, email2@example.com"
                    />
                    <p className="text-xs text-muted-foreground">
                        {t('recipients.customEmailsHint')}
                    </p>
                </div>
            )}
        </div>
    );
}
