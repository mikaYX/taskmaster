import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EmailSettingsPage } from './email-settings-page';

const mock = vi.hoisted(() => {
    const values: Record<string, unknown> = {};
    return {
        values,
        updateSettings: vi.fn(),
        updateSetting: vi.fn(),
    };
});

vi.mock('../hooks/use-settings', () => ({
    useSettings: () => ({
        settings: Object.entries(mock.values).map(([key, value]) => ({ key, value })),
        getSetting: (key: string) => mock.values[key],
        updateSettings: mock.updateSettings,
        updateSetting: mock.updateSetting,
        isLoading: false,
        isUpdating: false,
        testEmail: vi.fn(),
        isTestingEmail: false,
    }),
}));

window.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

describe('EmailSettingsPage save', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(mock.values)) delete mock.values[key];
        Object.assign(mock.values, {
            'email.enabled': true,
            'email.provider': 'smtp',
            'email.from': 'noreply@example.com',
            'email.smtp.host': 'smtp.example.com',
            'email.smtp.port': 465,
            'email.smtp.user': 'mailer',
            'email.smtp.password': '••••••••',
        });
    });

    it('saves every field in one request and sends a stored secret back as the mask', async () => {
        const { container } = render(<EmailSettingsPage />);

        await userEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

        await waitFor(() => expect(mock.updateSettings).toHaveBeenCalledTimes(1));
        expect(mock.updateSetting).not.toHaveBeenCalled();
        expect(mock.updateSettings.mock.calls[0][0]).toEqual({
            'email.enabled': true,
            'email.provider': 'smtp',
            'email.from': 'noreply@example.com',
            'email.smtp.host': 'smtp.example.com',
            'email.smtp.port': 465,
            'email.smtp.user': 'mailer',
            'email.smtp.password': '••••••••',
        });
        expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
    });
});
