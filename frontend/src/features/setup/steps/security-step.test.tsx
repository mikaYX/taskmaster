import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { setupApi } from '@/api';
import { useSetupStore } from '@/stores';
import { SecurityStep } from './security-step';

vi.mock('@/api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api')>()),
    setupApi: { initialize: vi.fn() },
}));

const PASSWORD = 'Str0ng-Passw0rd-2026!';

/** Fills the form by field id, so it works in any language, and submits it. */
async function submit() {
    const onNext = vi.fn();
    const { container } = render(<SecurityStep onNext={onNext} onBack={vi.fn()} />);
    const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
    fireEvent.change(field('email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(field('password'), { target: { value: PASSWORD } });
    fireEvent.change(field('confirmPassword'), { target: { value: PASSWORD } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(setupApi.initialize).toHaveBeenCalledOnce());
    return onNext;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setupApi.initialize).mockResolvedValue({ success: true, message: 'ok' });
    useSetupStore.getState().resetSetup();
});

afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
});

describe('security step sends the wizard preferences', () => {
    it('sends the time zone chosen in step 1 and the language the wizard is shown in', async () => {
        useSetupStore.getState().setInitialPreferences({ todolistEnabled: false, timezone: 'America/New_York' });
        await i18n.changeLanguage('fr');

        await submit();

        expect(setupApi.initialize).toHaveBeenCalledWith({
            username: 'admin@example.com',
            password: PASSWORD,
            addonsTodolistEnabled: false,
            language: 'fr',
            timezone: 'America/New_York',
        });
    });

    it('sends English by default, and no time zone when none was chosen', async () => {
        const onNext = await submit();

        expect(setupApi.initialize).toHaveBeenCalledWith(
            expect.objectContaining({ language: 'en', timezone: undefined }),
        );
        expect(onNext).toHaveBeenCalled();
    });
});
