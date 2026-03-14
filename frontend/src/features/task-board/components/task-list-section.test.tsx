import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskListSection } from './task-list-section';
import type { BoardItem } from '@/api/types';

// Mock TaskRow to avoid dependency clutter
vi.mock('./task-row', () => ({
    TaskRow: ({ item }: { item: BoardItem }) => <div data-testid="task-row">{item.taskName}</div>
}));

// Provide stable ResizeObserver for Radix Collapsible
globalThis.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// localStorage in-memory mock — jsdom ne fournit pas clear() dans cet environnement
const localStorageStore: Record<string, string> = {};
vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value; },
    removeItem: (key: string) => { delete localStorageStore[key]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
});

describe('TaskListSection - Collapse/Expand Behavior', () => {
    const mockItems: BoardItem[] = [
        {
            taskId: 1,
            taskName: 'Task 1',
            status: 'RUNNING',
            periodicity: 'daily',
            instanceDate: '2026-03-04',
            originalDate: '2026-03-04',
            periodStart: '2026-03-04T08:00:00Z',
            periodEnd: '2026-03-04T18:00:00Z',
            assignedUsers: [],
            assignedGroups: [],
            isShifted: false
        }
    ];

    const defaultProps = {
        title: 'Active Tasks',
        items: mockItems,
        onStatusChange: vi.fn(),
        onAdminAction: vi.fn(),
    };

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('1) Is initially open and content is visible', () => {
        render(<TaskListSection {...defaultProps} />);

        // Checked by presence of TaskRow (mocked)
        expect(screen.getByTestId('task-row')).toBeDefined();
        expect(screen.getByText('Task 1')).toBeDefined();

        const button = screen.getByRole('button', { name: /Active Tasks/i });
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('2) Collapses on click - content hidden but counter visible', async () => {
        render(<TaskListSection {...defaultProps} />);

        const button = screen.getByRole('button', { name: /Active Tasks/i });

        // Initial state
        expect(screen.getByTestId('task-row')).toBeDefined();

        // Click to collapse
        fireEvent.click(button);

        expect(button.getAttribute('aria-expanded')).toBe('false');

        // In Radix Collapsible, content is removed from DOM or hidden via CSS depending on config.
        expect(screen.queryByTestId('task-row')).toBeNull();

        // Counter "1" should still be visible in the header
        expect(screen.getByText('1')).toBeDefined();
    });

    it('3) Re-expands on second click', () => {
        render(<TaskListSection {...defaultProps} />);
        const button = screen.getByRole('button', { name: /Active Tasks/i });

        fireEvent.click(button); // Collapse
        expect(screen.queryByTestId('task-row')).toBeNull();

        fireEvent.click(button); // Expand
        expect(screen.getByTestId('task-row')).toBeDefined();
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('4) Works with Enter and Space keys (A11y)', async () => {
        const user = userEvent.setup();
        render(<TaskListSection {...defaultProps} />);
        const button = screen.getByRole('button', { name: /Active Tasks/i });

        button.focus();

        // Enter
        await user.keyboard('{Enter}');
        expect(button.getAttribute('aria-expanded')).toBe('false');

        // Space
        await user.keyboard(' ');
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('5) Persists state in localStorage and respects it on re-render', () => {
        const title = 'Persistent Section';
        const slug = 'persistent-section';
        const storageKey = `taskboard-section-expanded-${slug}`;

        // First render, collapse it
        const { unmount } = render(<TaskListSection {...defaultProps} title={title} />);
        const button = screen.getByRole('button', { name: new RegExp(title, 'i') });

        fireEvent.click(button);
        expect(localStorage.getItem(storageKey)).toBe('false');

        unmount();

        // Re-render: should be closed
        render(<TaskListSection {...defaultProps} title={title} />);
        const newButton = screen.getByRole('button', { name: new RegExp(title, 'i') });
        expect(newButton.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByTestId('task-row')).toBeNull();
    });

    it('6) Sections remain independent of each other', () => {
        render(
            <>
                <TaskListSection {...defaultProps} title="Section A" />
                <TaskListSection {...defaultProps} title="Section B" />
            </>
        );

        const btnA = screen.getByRole('button', { name: /Section A/i });
        const btnB = screen.getByRole('button', { name: /Section B/i });

        // Collapse A
        fireEvent.click(btnA);

        expect(btnA.getAttribute('aria-expanded')).toBe('false');
        expect(btnB.getAttribute('aria-expanded')).toBe('true'); // B stays open
    });
});
