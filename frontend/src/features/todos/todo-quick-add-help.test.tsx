import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TodoQuickAddHelp } from './todo-quick-add-help';

describe('TodoQuickAddHelp', () => {
    it('opens a cheat sheet with a worked example', async () => {
        const user = userEvent.setup();
        render(<TodoQuickAddHelp />);

        expect(screen.queryByText('Add faster')).toBeNull();
        await user.click(screen.getByRole('button', { name: /How to fill in the date/ }));

        expect(screen.getByText('Add faster')).toBeTruthy();
        expect(screen.getByText(/due tomorrow at 14:30, urgent priority/)).toBeTruthy();
        expect(screen.getByText('A priority')).toBeTruthy();
    });
});
