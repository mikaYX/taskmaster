import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const options = [
    { value: '1', label: 'Auj.' },
    { value: '7', label: '7j' },
];

describe('SegmentedControl', () => {
    it('marks the selected option as pressed', () => {
        render(<SegmentedControl options={options} value="7" onChange={vi.fn()} ariaLabel="Période" />);

        expect(screen.getByRole('group', { name: 'Période' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '7j' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Auj.' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('reports the clicked option', async () => {
        const onChange = vi.fn();
        render(<SegmentedControl options={options} value="7" onChange={onChange} ariaLabel="Période" />);

        await userEvent.click(screen.getByRole('button', { name: 'Auj.' }));

        expect(onChange).toHaveBeenCalledWith('1');
    });

    it('selects nothing when the value matches no option (a custom date range)', () => {
        render(<SegmentedControl options={options} value={null} onChange={vi.fn()} ariaLabel="Période" />);

        expect(screen.getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    });
});
