import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoOpenReminder } from './todo-open-reminder';

const summary = vi.hoisted(() => ({ data: undefined as { overdue: number; dueToday: number } | undefined }));
const warning = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-todos', () => ({ useTodoSummary: () => summary }));
vi.mock('sonner', () => ({ toast: { warning } }));

const show = () =>
    render(
        <MemoryRouter>
            <TodoOpenReminder />
        </MemoryRouter>,
    );

describe('TodoOpenReminder', () => {
    beforeEach(() => {
        sessionStorage.clear();
        warning.mockReset();
        summary.data = undefined;
    });

    it('stays silent while loading and when nothing is late or due today', () => {
        show();
        summary.data = { overdue: 0, dueToday: 0 };
        show();

        expect(warning).not.toHaveBeenCalled();
    });

    it('says how many tasks are late and due today, once per session', () => {
        summary.data = { overdue: 3, dueToday: 1 };
        const first = show();

        expect(warning).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][1].description).toBe('3 tasks overdue · 1 task due today');

        first.unmount();
        show();
        expect(warning).toHaveBeenCalledTimes(1);
    });
});
