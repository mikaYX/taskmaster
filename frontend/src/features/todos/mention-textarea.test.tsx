import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MentionTextarea, type PickedMention } from './mention-textarea';

const targets = vi.hoisted(() => ({
    state: { data: undefined as unknown, isLoading: false, isError: false },
}));
vi.mock('@/hooks/use-todos', () => ({ useMentionTargets: () => targets.state }));

const onPick = vi.fn();
const onSubmit = vi.fn();

function Harness() {
    const [value, setValue] = useState('');
    const [picked, setPicked] = useState<PickedMention[]>([]);
    return (
        <MentionTextarea
            todoId={5}
            value={value}
            onChange={setValue}
            picked={picked}
            onPick={(m) => {
                onPick(m);
                setPicked((l) => [...l, m]);
            }}
            onSubmit={onSubmit}
            label="Comment"
            placeholder="Write"
        />
    );
}

const loaded = {
    users: [
        { id: 1, username: 'eloise', fullname: 'Éloïse Martin' },
        { id: 2, username: 'paul', fullname: null },
    ],
    groups: [{ id: 4, name: 'Maintenance' }],
};

describe('MentionTextarea', () => {
    it('suggests people and teams after @, picks with the keyboard', async () => {
        targets.state = { data: loaded, isLoading: false, isError: false };
        onPick.mockReset();
        const user = userEvent.setup();
        render(<Harness />);

        await user.type(screen.getByLabelText('Comment'), 'Hi @');
        expect(screen.getAllByRole('option')).toHaveLength(3);

        await user.keyboard('{ArrowDown}');
        expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
        await user.keyboard('{Enter}');

        expect(onPick).toHaveBeenCalledWith({ ref: 'user:2', label: 'paul' });
        expect((screen.getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Hi @paul ');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('filters while typing, accents ignored, and picks a team with the mouse', async () => {
        targets.state = { data: loaded, isLoading: false, isError: false };
        onPick.mockReset();
        const user = userEvent.setup();
        render(<Harness />);

        await user.type(screen.getByLabelText('Comment'), '@eloi');
        expect(screen.getAllByRole('option')).toHaveLength(1);

        await user.clear(screen.getByLabelText('Comment'));
        await user.type(screen.getByLabelText('Comment'), '@maint');
        await user.click(screen.getByRole('option', { name: /Maintenance/ }));
        expect(onPick).toHaveBeenCalledWith({ ref: 'group:4', label: 'Maintenance' });
    });

    it('closes with Escape without losing the text', async () => {
        targets.state = { data: loaded, isLoading: false, isError: false };
        const user = userEvent.setup();
        render(<Harness />);

        await user.type(screen.getByLabelText('Comment'), '@e');
        expect(screen.getByRole('listbox')).toBeTruthy();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect((screen.getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('@e');
    });

    it('shows loading, error and empty states', async () => {
        const user = userEvent.setup();
        targets.state = { data: undefined, isLoading: true, isError: false };
        const { unmount } = render(<Harness />);
        await user.type(screen.getByLabelText('Comment'), '@');
        expect(screen.getByText('Loading…')).toBeTruthy();
        unmount();

        targets.state = { data: undefined, isLoading: false, isError: true };
        const second = render(<Harness />);
        await user.type(screen.getByLabelText('Comment'), '@');
        expect(screen.getByText('Could not load the suggestions.')).toBeTruthy();
        second.unmount();

        targets.state = { data: loaded, isLoading: false, isError: false };
        render(<Harness />);
        await user.type(screen.getByLabelText('Comment'), '@zzz');
        expect(screen.getByText('Nobody to mention with this name.')).toBeTruthy();
    });

    it('keeps Enter for a new line when nothing is suggested, Ctrl+Enter sends', async () => {
        targets.state = { data: loaded, isLoading: false, isError: false };
        onSubmit.mockReset();
        const user = userEvent.setup();
        render(<Harness />);

        await user.type(screen.getByLabelText('Comment'), 'Plain{Enter}text');
        expect((screen.getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Plain\ntext');
        await user.keyboard('{Control>}{Enter}{/Control}');
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});
