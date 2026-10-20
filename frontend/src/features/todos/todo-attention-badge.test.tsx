import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoAttentionBadge } from './todo-attention-badge';

const summary = vi.hoisted(() => ({ data: undefined as { overdue: number; dueToday: number } | undefined }));
vi.mock('@/hooks/use-todos', () => ({ useTodoSummary: () => summary }));

describe('TodoAttentionBadge', () => {
    beforeEach(() => {
        summary.data = undefined;
    });

    it('shows nothing before the summary arrives or when nothing needs attention', () => {
        const { container, rerender } = render(<TodoAttentionBadge />);
        expect(container.textContent).toBe('');

        summary.data = { overdue: 0, dueToday: 0 };
        rerender(<TodoAttentionBadge />);
        expect(container.textContent).toBe('');
    });

    it('adds late and due-today todos, red as soon as one is late', () => {
        summary.data = { overdue: 2, dueToday: 1 };
        render(<TodoAttentionBadge />);

        const badge = screen.getByRole('status');
        expect(badge.textContent).toBe('3');
        expect(badge.className).toContain('bg-destructive');
        expect(badge.getAttribute('aria-label')).toBe('2 overdue, 1 due today');
    });

    it('is amber when todos are only due today, and caps the count', () => {
        summary.data = { overdue: 0, dueToday: 120 };
        render(<TodoAttentionBadge />);

        const badge = screen.getByRole('status');
        expect(badge.textContent).toBe('99+');
        expect(badge.className).toContain('bg-amber-500');
    });
});
