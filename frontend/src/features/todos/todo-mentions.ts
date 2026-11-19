import type { TodoComment, TodoMentionTargets, TodoPerson } from '@/api/types';

const personName = (p: { fullname: string | null; username: string }) => p.fullname || p.username;

/** A person or a team that can be offered after "@", with the text inserted when picked. */
export interface MentionOption {
    /** `user:<id>` / `group:<id>`, what the server stores. */
    ref: string;
    kind: 'user' | 'group';
    /** Text that follows the "@" in the comment. */
    label: string;
    /** Shown under the name to tell namesakes apart. */
    hint: string;
}

/** Lower case, no accents: "Éloïse" matches "eloise". */
export const fold = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

export function buildMentionOptions(targets: TodoMentionTargets | undefined): MentionOption[] {
    if (!targets) return [];
    const labels = [...targets.users.map(personName), ...targets.groups.map((g) => g.name)];
    // Two people (or a person and a team) with the same name: the text carries the account name.
    const ambiguous = (label: string) => labels.filter((l) => l === label).length > 1;
    return [
        ...targets.users.map((user: TodoPerson) => {
            const name = personName(user);
            return {
                ref: `user:${user.id}`,
                kind: 'user' as const,
                label: ambiguous(name) ? `${name} (${user.username})` : name,
                hint: user.username,
            };
        }),
        ...targets.groups.map((group) => ({
            ref: `group:${group.id}`,
            kind: 'group' as const,
            label: ambiguous(group.name) ? `${group.name} #${group.id}` : group.name,
            hint: '',
        })),
    ];
}

/** The "@text" being typed right before the caret, if any (spaces allowed inside a name). */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
    const before = text.slice(0, caret);
    const match = /(^|\s)@([^\n@]{0,30})$/.exec(before);
    if (!match) return null;
    return { query: match[2], start: before.length - match[2].length - 1 };
}

export function filterMentionOptions(options: MentionOption[], query: string, limit = 8): MentionOption[] {
    const needle = fold(query.trim());
    return options.filter((o) => fold(o.label).includes(needle) || fold(o.hint).includes(needle)).slice(0, limit);
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texts that count as a mention of this entry in a stored comment. */
function mentionTexts(mention: NonNullable<TodoComment['mentions']>[number]): string[] {
    if (mention.user) {
        const name = personName(mention.user);
        return [`@${name} (${mention.user.username})`, `@${name}`];
    }
    if (mention.group) return [`@${mention.group.name} #${mention.group.id}`, `@${mention.group.name}`];
    return [];
}

/** Splits a comment into plain and highlighted parts, using the mentions the server stored. */
export function splitMentions(body: string, mentions: TodoComment['mentions']): Array<{ text: string; mention: boolean }> {
    const texts = [...new Set((mentions ?? []).flatMap(mentionTexts))].sort((a, b) => b.length - a.length);
    if (texts.length === 0) return [{ text: body, mention: false }];
    const regex = new RegExp(`(${texts.map(escapeRegExp).join('|')})`, 'g');
    return body
        .split(regex)
        .filter((part) => part !== '')
        .map((part) => ({ text: part, mention: texts.includes(part) }));
}

/** The refs to send: only the mentions whose "@label" is still in the text. */
export function mentionsStillInText(text: string, picked: Array<{ ref: string; label: string }>): string[] {
    return [...new Set(picked.filter((m) => text.includes(`@${m.label}`)).map((m) => m.ref))];
}
