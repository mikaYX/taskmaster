import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import { DateInput } from './date-input';

describe('DateInput', () => {
    it.each([
        ['fr', '02/11/2026', 'jj/mm/aaaa'],
        ['en', '11/02/2026', 'mm/dd/yyyy'],
    ])('displays dates in the app language (%s)', async (lng, formatted, placeholder) => {
        await i18n.changeLanguage(lng);
        const { rerender } = render(<DateInput aria-label="due" value="2026-11-02" onChange={() => {}} />);
        expect(screen.getByLabelText('due').textContent).toBe(formatted);

        rerender(<DateInput aria-label="due" value="" onChange={() => {}} />);
        expect(screen.getByLabelText('due').textContent).toBe(placeholder);
    });

    it('returns the picked day as yyyy-MM-dd', async () => {
        await i18n.changeLanguage('fr');
        const onChange = vi.fn();
        render(<DateInput aria-label="due" value="2026-11-02" onChange={onChange} />);

        await userEvent.click(screen.getByLabelText('due'));
        await userEvent.click(await screen.findByRole('button', { name: /15 novembre 2026/i }));

        expect(onChange).toHaveBeenCalledWith('2026-11-15');
    });
});
