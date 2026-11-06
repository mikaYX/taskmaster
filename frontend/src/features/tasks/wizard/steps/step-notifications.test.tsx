import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import i18n from '@/lib/i18n';
import { StepNotifications } from './step-notifications';
import { formatReminderOffset, nextReminderOffset } from './reminder-offset';
import type { CreateTaskFormValues } from '../../schemas/task-creation.schema';

vi.mock('@/hooks/use-notifications', () => ({
    useChannels: () => ({
        data: [{ id: 1, name: 'Team chat', type: 'SLACK' }],
        isLoading: false,
    }),
}));
vi.mock('@/api/users', () => ({ usersApi: { getAll: async () => [] } }));
vi.mock('@/api/groups', () => ({ groupsApi: { getAll: async () => [] } }));

const baseRow = {
    channelId: 1,
    notifyOnFailed: false,
    notifyOnMissing: false,
    notifyOnReminder: false,
    reminderOffsetMinutes: 60,
};

function Harness({ children, reminder }: { children: ReactNode; reminder: boolean }) {
    const form = useForm<CreateTaskFormValues>({
        defaultValues: { notifications: [{ ...baseRow, notifyOnReminder: reminder }] } as never,
    });
    return <FormProvider {...form}>{children}</FormProvider>;
}

function renderStep(reminder: boolean) {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <Harness reminder={reminder}>
                    <StepNotifications />
                </Harness>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('StepNotifications - reminder delay', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('fr');
    });

    it('hides the delay while the reminder box is not ticked', () => {
        renderStep(false);
        expect(screen.queryByTestId('reminder-offset')).not.toBeInTheDocument();
    });

    it('shows the delay once the reminder box is ticked', () => {
        renderStep(false);
        fireEvent.click(screen.getByRole('checkbox', { name: /Rappel/ }));
        expect(screen.getByTestId('reminder-offset')).toBeInTheDocument();
    });

    it('shows the delay of a channel that already has a reminder', () => {
        renderStep(true);
        expect(screen.getByTestId('reminder-offset')).toHaveTextContent('Délai du rappel');
    });
});

describe('reminder delay values', () => {
    it('stays on steps of 15 minutes, between 15 minutes and 24 hours', () => {
        expect(nextReminderOffset(1, 30)).toBe(90);
        expect(nextReminderOffset(0, 0)).toBe(15);
        expect(nextReminderOffset(24, 45)).toBe(1440);
    });

    it('formats the delay', () => {
        expect(formatReminderOffset(45)).toBe('45 min');
        expect(formatReminderOffset(60)).toBe('1 h');
        expect(formatReminderOffset(90)).toBe('1 h 30');
    });
});
