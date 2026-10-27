import { describe, expect, it } from 'vitest';
import { applyAssignment, assignmentSections, assignmentValue } from './todo-assignment';

const t = (key: string, values?: Record<string, unknown>) => (values?.count !== undefined ? `${key}:${values.count}` : key);

describe('todo assignment', () => {
    it('lists the teams before the people, with the size of each team', () => {
        const sections = assignmentSections(
            t,
            [{ id: 4, name: 'Maintenance', memberCount: 3 }],
            [{ id: 8, username: 'marie', fullname: 'Marie Dupont' }, { id: 9, username: 'paul', fullname: null }],
        );

        expect(sections.map((s) => s.key)).toEqual(['groups', 'users']);
        expect(sections[0].items).toEqual([{ value: 'group:4', label: 'Maintenance', hint: 'targetPicker.members:3' }]);
        expect(sections[1].items.map((i) => i.label)).toEqual(['Marie Dupont', 'paul']);
    });

    it('leaves out a section that is not offered', () => {
        expect(assignmentSections(t, undefined, [{ id: 8, username: 'marie', fullname: null }]).map((s) => s.key)).toEqual(['users']);
    });

    it('sends a todo to a team alone, clearing the person', () => {
        expect(applyAssignment(['group:4'])).toEqual({ groupId: '4', assigneeId: '' });
    });

    it('sends a todo to a person alone, clearing the team', () => {
        expect(applyAssignment(['user:8'])).toEqual({ groupId: '', assigneeId: '8' });
    });

    it('goes back to the whole site when nothing is picked', () => {
        expect(applyAssignment([])).toEqual({ groupId: '', assigneeId: '' });
    });

    it('shows the person when a todo carries both a person and a team', () => {
        expect(assignmentValue('4', '8')).toEqual(['user:8']);
        expect(assignmentValue('4', '')).toEqual(['group:4']);
        expect(assignmentValue('', '')).toEqual([]);
    });
});
