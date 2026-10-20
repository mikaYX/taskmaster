import { describeDue } from './todo-due';
import i18n from '@/lib/i18n';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

const now = new Date('2026-10-19T15:00:00Z');

describe('describeDue', () => {
    it('says today and tomorrow in words', () => {
        expect(describeDue('2026-10-19T00:00:00.000Z', now)).toEqual({ label: "Aujourd'hui", overdue: false });
        expect(describeDue('2026-10-20T00:00:00.000Z', now)).toEqual({ label: 'Demain', overdue: false });
    });

    it('counts the days for the coming week', () => {
        expect(describeDue('2026-10-23T00:00:00.000Z', now)).toEqual({ label: 'Dans 4 j', overdue: false });
    });

    it('flags overdue todos with the number of days late', () => {
        expect(describeDue('2026-10-17T00:00:00.000Z', now)).toEqual({ label: 'En retard de 2 j', overdue: true });
    });

    it('is not overdue on the due day itself, whatever the hour', () => {
        expect(describeDue('2026-10-19T00:00:00.000Z', new Date('2026-10-19T23:30:00Z')).overdue).toBe(false);
    });

    it('falls back to a short date beyond a week', () => {
        const { label, overdue } = describeDue('2026-11-02T00:00:00.000Z', now);
        expect(overdue).toBe(false);
        expect(label).toMatch(/2/);
    });

    it('follows the app language', async () => {
        await i18n.changeLanguage('en');
        try {
            expect(describeDue('2026-10-19T00:00:00.000Z', now).label).toBe('Today');
            expect(describeDue('2026-10-17T00:00:00.000Z', now).label).toBe('Late by 2 d');
        } finally {
            await i18n.changeLanguage('fr');
        }
    });
});
