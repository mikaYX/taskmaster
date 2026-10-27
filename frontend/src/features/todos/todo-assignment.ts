import type { TargetPickerSection } from '@/components/target-picker';

type Translate = (key: string, values?: Record<string, unknown>) => string;

interface Person {
    id: number;
    username: string;
    fullname: string | null;
}

/** The menu of a collective todo: teams first (a team handles the todo together), then people. */
export function assignmentSections(
    t: Translate,
    groups: { id: number; name: string; memberCount?: number }[] | undefined,
    people: Person[] | undefined,
): TargetPickerSection[] {
    const sections: TargetPickerSection[] = [];
    if (groups) {
        sections.push({
            key: 'groups',
            label: t('targetPicker.teams'),
            emptyLabel: t('targetPicker.noTeams'),
            items: groups.map((g) => ({
                value: `group:${g.id}`,
                label: g.name,
                hint: g.memberCount === undefined ? undefined : t('targetPicker.members', { count: g.memberCount }),
            })),
        });
    }
    if (people) {
        sections.push({
            key: 'users',
            label: t('targetPicker.people'),
            items: people.map((p) => ({ value: `user:${p.id}`, label: p.fullname || p.username })),
        });
    }
    return sections;
}

/** What the menu shows. A person wins when a todo carries both a person and a team. */
export const assignmentValue = (groupId: string, assigneeId: string): string[] =>
    assigneeId ? [`user:${assigneeId}`] : groupId ? [`group:${groupId}`] : [];

/**
 * A todo goes to one person or to one team, never both: a team handles it together,
 * a person takes it alone. Nothing picked means the whole site, nobody in particular.
 */
export function applyAssignment(values: string[]): { groupId: string; assigneeId: string } {
    const [kind, id = ''] = (values[0] ?? '').split(':');
    return {
        groupId: kind === 'group' ? id : '',
        assigneeId: kind === 'user' ? id : '',
    };
}
