import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import i18n from '@/lib/i18n';
import { DateTimeInput } from './date-time-input';

describe('DateTimeInput', () => {
    it.each([
        ['fr', '02/11/2026'],
        ['en', '11/02/2026'],
    ])('displays the day in the app language (%s) and the time on 24 hours', async (lng, formatted) => {
        await i18n.changeLanguage(lng);
        render(<DateTimeInput id="when" value="2026-11-02T18:30" onChange={() => {}} />);
        expect(document.getElementById('when')?.textContent).toBe(formatted);
        const [hour, minute] = screen.getAllByRole('combobox');
        expect(hour.textContent).toBe('18');
        expect(minute.textContent).toBe('30');
    });

    it('gives the default time when a day is picked first, and keeps the time when the day changes', async () => {
        await i18n.changeLanguage('fr');
        const onChange = vi.fn();
        const { rerender } = render(<DateTimeInput id="when" value="" onChange={onChange} defaultTime="23:55" />);
        await userEvent.click(document.getElementById('when')!);
        await userEvent.click(await screen.findByRole('button', { name: /15 /i }));
        expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{4}-\d{2}-15T23:55$/));

        rerender(<DateTimeInput id="when" value="2026-11-02T08:15" onChange={onChange} defaultTime="23:55" />);
        await userEvent.click(document.getElementById('when')!);
        await userEvent.click(await screen.findByRole('button', { name: /20 novembre 2026/i }));
        expect(onChange).toHaveBeenLastCalledWith('2026-11-20T08:15');
    });

    it('cannot set a time before a day is chosen', () => {
        render(<DateTimeInput value="" onChange={() => {}} />);
        for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
    });
});
