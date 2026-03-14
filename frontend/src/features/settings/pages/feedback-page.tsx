import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, Loader2, Send } from 'lucide-react';

export function FeedbackPage() {
    const { t } = useTranslation();
    const { submitFeedback, isSubmittingFeedback } = useSettings();
    const [type, setType] = useState<'bug' | 'suggestion'>('bug');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;

        submitFeedback({
            type,
            title: title.trim(),
            description: description.trim(),
        });

        // Reset title and description after successful submission is handled by toast in hook
        // but we can clear them here if it's not a lot of work.
        // For simplicity, we'll keep them or let the user clear them.
        setTitle('');
        setDescription('');
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Github className="h-5 w-5" />
                        <CardTitle>{t('settings.feedback')}</CardTitle>
                    </div>
                    <CardDescription>
                        {t('settings.feedbackDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-3">
                            <Label>{t('settings.feedbackType')}</Label>
                            <RadioGroup
                                value={type}
                                onValueChange={(val) => setType(val as 'bug' | 'suggestion')}
                                className="flex flex-col space-y-1"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="bug" id="bug" />
                                    <Label htmlFor="bug" className="font-normal cursor-pointer">
                                        {t('settings.bug')}
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="suggestion" id="suggestion" />
                                    <Label htmlFor="suggestion" className="font-normal cursor-pointer">
                                        {t('settings.suggestion')}
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="title">{t('settings.feedbackTitle')}</Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={t('settings.feedbackTitlePlaceholder')}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">{t('settings.feedbackContent')}</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={t('settings.feedbackContentPlaceholder')}
                                rows={5}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full sm:w-auto gap-2"
                            disabled={isSubmittingFeedback || !title.trim() || !description.trim()}
                        >
                            {isSubmittingFeedback ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                            {t('settings.submitFeedback')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
