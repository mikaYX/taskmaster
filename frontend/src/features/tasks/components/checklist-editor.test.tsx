import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecklistEditor } from './checklist-editor';
import type { ChecklistStep } from '@/api/types';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
function Editor() {
    const [steps, setSteps] = useState<ChecklistStep[]>([]);
    return <><ChecklistEditor value={steps} onChange={setSteps} /><output data-testid="definition">{JSON.stringify(steps)}</output></>;
}
afterEach(cleanup);
describe('optional checklist definition', () => {
    it('adds and configures a step with a stable identifier, then removes it', () => {
        render(<Editor />);
        fireEvent.click(screen.getByRole('button', { name: 'execution.addStep' }));
        const first = JSON.parse(screen.getByTestId('definition').textContent!)[0];
        expect(first.id).toMatch(/^[a-f0-9]{32}$/);
        fireEvent.change(screen.getByRole('textbox', { name: 'execution.stepLabel' }), { target: { value: 'Temperature' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'execution.stepKind' }), { target: { value: 'NUMBER' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'execution.required' }));
        expect(JSON.parse(screen.getByTestId('definition').textContent!)).toEqual([{ ...first, label: 'Temperature', kind: 'NUMBER', required: false }]);
        fireEvent.click(screen.getByRole('button', { name: 'execution.removeStep' }));
        expect(screen.getByTestId('definition').textContent).toBe('[]');
    });
});
