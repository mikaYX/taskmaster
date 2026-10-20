import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useTodoSummary } from '@/hooks/use-todos';

const SESSION_KEY = 'todo_open_reminder_shown';

/** Remembered for the browser session only: coming back tomorrow shows it again. */
function alreadyShown(): boolean {
    try {
        return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

function remember() {
    try {
        sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
        /* private mode: the worst case is a second reminder */
    }
}

/**
 * Once per session, when the app opens: "3 todos are late, 2 are due today", with a
 * button to the list. Renders nothing itself.
 */
export function TodoOpenReminder() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data } = useTodoSummary();

    useEffect(() => {
        if (!data || alreadyShown()) return;
        if (data.overdue + data.dueToday === 0) return;
        remember();

        const parts = [
            data.overdue > 0 ? t('todos.openReminder.overdue', { count: data.overdue }) : null,
            data.dueToday > 0 ? t('todos.openReminder.today', { count: data.dueToday }) : null,
        ].filter(Boolean);
        toast.warning(t('todos.openReminder.title'), {
            description: parts.join(' · '),
            duration: 10_000,
            action: { label: t('todos.openReminder.view'), onClick: () => navigate('/todos') },
        });
    }, [data, navigate, t]);

    return null;
}
