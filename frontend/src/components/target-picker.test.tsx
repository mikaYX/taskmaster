import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TargetPicker, type TargetPickerSection } from './target-picker';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values?.count !== undefined ? `${key}:${values.count}` : key),
    }),
}));

const SECTIONS: TargetPickerSection[] = [
    { key: 'groups', label: 'Équipes', items: [{ value: 'group:4', label: 'Maintenance', hint: '3 membres' }] },
    {
        key: 'users',
        label: 'Personnes',
        items: [
            { value: 'user:8', label: 'Marie Dupont' },
            { value: 'user:9', label: 'Éric Martin' },
        ],
    },
];

function Harness({ multiple = false, initial = [] as string[], onChange = vi.fn() }) {
    const [value, setValue] = useState(initial);
    return (
        <TargetPicker
            sections={SECTIONS}
            value={value}
            multiple={multiple}
            noneLabel="Personne"
            placeholder="Choisir"
            ariaLabel="Cible"
            onChange={(next) => {
                setValue(next);
                onChange(next);
            }}
        />
    );
}

const open = () => fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));

describe('TargetPicker', () => {
    it('lists teams before people', () => {
        render(<Harness />);
        open();

        const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
        expect(groups).toEqual(['Équipes', 'Personnes']);
    });

    it('picks one entry and closes in single mode', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        open();

        fireEvent.click(screen.getByRole('option', { name: /Maintenance/ }));

        expect(onChange).toHaveBeenCalledWith(['group:4']);
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByRole('combobox', { name: 'Cible' }).textContent).toContain('Maintenance');
    });

    it('clears the choice with the none entry in single mode', () => {
        const onChange = vi.fn();
        render(<Harness initial={['user:8']} onChange={onChange} />);
        open();

        fireEvent.click(screen.getByRole('option', { name: 'Personne' }));

        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('stays open and keeps ticking in multiple mode', () => {
        const onChange = vi.fn();
        render(<Harness multiple onChange={onChange} />);
        open();

        fireEvent.click(screen.getByRole('option', { name: 'Marie Dupont' }));
        fireEvent.click(screen.getByRole('option', { name: 'Éric Martin' }));

        expect(onChange).toHaveBeenLastCalledWith(['user:8', 'user:9']);
        expect(screen.getByRole('listbox')).toBeDefined();
        expect(screen.getByRole('combobox', { name: 'Cible' }).textContent).toContain('targetPicker.selectedCount:2');
    });

    it('filters without caring about accents or case, and selects only what is shown', () => {
        const onChange = vi.fn();
        render(<Harness multiple onChange={onChange} />);
        open();

        fireEvent.change(screen.getByRole('textbox', { name: 'targetPicker.search' }), { target: { value: 'eric' } });
        expect(screen.queryByRole('option', { name: 'Marie Dupont' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'targetPicker.selectAll' }));

        expect(onChange).toHaveBeenLastCalledWith(['user:9']);
    });

    it('clears only what is shown', () => {
        const onChange = vi.fn();
        render(<Harness multiple initial={['user:8', 'user:9']} onChange={onChange} />);
        open();

        fireEvent.change(screen.getByRole('textbox', { name: 'targetPicker.search' }), { target: { value: 'marie' } });
        fireEvent.click(screen.getByRole('button', { name: 'targetPicker.clear' }));

        expect(onChange).toHaveBeenLastCalledWith(['user:9']);
    });

    it('says so when nothing matches', () => {
        render(<Harness />);
        open();

        fireEvent.change(screen.getByRole('textbox', { name: 'targetPicker.search' }), { target: { value: 'zzz' } });

        expect(screen.getByText('targetPicker.empty')).toBeDefined();
    });
});
