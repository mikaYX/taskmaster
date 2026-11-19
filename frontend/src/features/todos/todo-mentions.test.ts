import { describe, expect, it } from 'vitest';
import {
    activeMentionQuery,
    buildMentionOptions,
    filterMentionOptions,
    mentionsStillInText,
    splitMentions,
} from './todo-mentions';

const targets = {
    users: [
        { id: 1, username: 'eloise', fullname: 'Éloïse Martin' },
        { id: 2, username: 'jean1', fullname: 'Jean Martin' },
        { id: 3, username: 'jean2', fullname: 'Jean Martin' },
    ],
    groups: [{ id: 4, name: 'Maintenance' }],
};

describe('mention options', () => {
    it('tells namesakes apart in the inserted text, and only them', () => {
        const options = buildMentionOptions(targets);
        expect(options.map((o) => o.label)).toEqual([
            'Éloïse Martin',
            'Jean Martin (jean1)',
            'Jean Martin (jean2)',
            'Maintenance',
        ]);
        expect(options.map((o) => o.ref)).toEqual(['user:1', 'user:2', 'user:3', 'group:4']);
    });

    it('searches without caring for case or accents', () => {
        const options = buildMentionOptions(targets);
        expect(filterMentionOptions(options, 'eloi').map((o) => o.ref)).toEqual(['user:1']);
        expect(filterMentionOptions(options, 'MAINT').map((o) => o.ref)).toEqual(['group:4']);
        expect(filterMentionOptions(options, 'jean2').map((o) => o.ref)).toEqual(['user:3']);
        expect(filterMentionOptions(options, 'zzz')).toEqual([]);
    });
});

describe('activeMentionQuery', () => {
    it('finds the @ word before the caret, with spaces and accents', () => {
        expect(activeMentionQuery('Hello @Él', 9)).toEqual({ query: 'Él', start: 6 });
        expect(activeMentionQuery('@Jean Mar', 9)).toEqual({ query: 'Jean Mar', start: 0 });
        expect(activeMentionQuery('mail a@b.fr', 11)).toBeNull(); // not a mention: no space before @
        expect(activeMentionQuery('no mention', 10)).toBeNull();
    });
});

describe('mentions in a stored comment', () => {
    const mentions = [
        { id: 1, userId: 1, groupId: null, user: { id: 1, username: 'eloise', fullname: 'Éloïse Martin' } },
        { id: 2, userId: null, groupId: 4, group: { id: 4, name: 'Maintenance' } },
    ];

    it('highlights the mentions the server stored, nothing else', () => {
        const parts = splitMentions('Salut @Éloïse Martin et @Maintenance, cc @Inconnu', mentions);
        expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual(['@Éloïse Martin', '@Maintenance']);
        expect(parts.map((p) => p.text).join('')).toBe('Salut @Éloïse Martin et @Maintenance, cc @Inconnu');
    });

    it('keeps the text untouched without mentions', () => {
        expect(splitMentions('a (b) [c] *', [])).toEqual([{ text: 'a (b) [c] *', mention: false }]);
    });

    it('sends only the mentions still present in the text', () => {
        const picked = [
            { ref: 'user:1', label: 'Éloïse Martin' },
            { ref: 'group:4', label: 'Maintenance' },
        ];
        expect(mentionsStillInText('Salut @Éloïse Martin', picked)).toEqual(['user:1']);
        expect(mentionsStillInText('rien', picked)).toEqual([]);
        expect(mentionsStillInText('@Maintenance @Maintenance', [...picked, picked[1]])).toEqual(['group:4']);
    });
});
