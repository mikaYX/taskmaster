import { parseQuickAdd } from './todo-quick-add';

// Tuesday 20 October 2026, local time.
const now = new Date(2026, 9, 20, 15, 30);

describe('parseQuickAdd', () => {
    it('leaves a plain sentence alone', () => {
        expect(parseQuickAdd('Appeler le fournisseur', now)).toEqual({ title: 'Appeler le fournisseur' });
    });

    it('reads the priority, the date and the time and keeps the rest as the title', () => {
        expect(parseQuickAdd('Appeler le fournisseur @demain @14h30 !urgent', now)).toEqual({
            title: 'Appeler le fournisseur',
            priority: 'URGENT',
            dueDate: '2026-10-21',
            dueTime: '14:30',
        });
    });

    it('works in English and in any place of the sentence', () => {
        expect(parseQuickAdd('!high @tomorrow Call the supplier @9h', now)).toEqual({
            title: 'Call the supplier',
            priority: 'HIGH',
            dueDate: '2026-10-21',
            dueTime: '09:00',
        });
    });

    it.each([
        ['!basse', 'LOW'],
        ['!LOW', 'LOW'],
        ['!normale', 'NORMAL'],
        ['!haute', 'HIGH'],
        ['!urgente', 'URGENT'],
    ])('reads the priority %s', (token, priority) => {
        expect(parseQuickAdd(`x ${token}`, now).priority).toBe(priority);
    });

    it.each([
        ["@aujourd'hui", '2026-10-20'],
        ['@today', '2026-10-20'],
        ['@demain', '2026-10-21'],
        ['@+3j', '2026-10-23'],
        ['@+2s', '2026-11-03'],
        ['@+1w', '2026-10-27'],
        ['@+10d', '2026-10-30'],
    ])('reads the date %s', (token, date) => {
        expect(parseQuickAdd(`x ${token}`, now).dueDate).toBe(date);
    });

    it('takes the next occurrence of a weekday, never today', () => {
        expect(parseQuickAdd('x @mercredi', now).dueDate).toBe('2026-10-21');
        expect(parseQuickAdd('x @friday', now).dueDate).toBe('2026-10-23');
        expect(parseQuickAdd('x @lun', now).dueDate).toBe('2026-10-26');
        // Today is a Tuesday: "@mardi" means next Tuesday.
        expect(parseQuickAdd('x @mardi', now).dueDate).toBe('2026-10-27');
    });

    it('reads explicit dates, rolling a past day/month to next year', () => {
        expect(parseQuickAdd('x @2026-11-02', now).dueDate).toBe('2026-11-02');
        expect(parseQuickAdd('x @02/11/2027', now).dueDate).toBe('2027-11-02');
        expect(parseQuickAdd('x @02/11', now).dueDate).toBe('2026-11-02');
        expect(parseQuickAdd('x @20/10', now).dueDate).toBe('2026-10-20');
        expect(parseQuickAdd('x @05/03', now).dueDate).toBe('2027-03-05');
    });

    it('does not read an impossible date or time, which stays in the title', () => {
        expect(parseQuickAdd('x @31/02', now)).toEqual({ title: 'x @31/02' });
        expect(parseQuickAdd('x @2026-02-30', now)).toEqual({ title: 'x @2026-02-30' });
        expect(parseQuickAdd('x @25h', now)).toEqual({ title: 'x @25h' });
        expect(parseQuickAdd('x @12:75', now)).toEqual({ title: 'x @12:75' });
    });

    it('reads the time in its usual spellings', () => {
        expect(parseQuickAdd('x @14h30', now).dueTime).toBe('14:30');
        expect(parseQuickAdd('x @14:30', now).dueTime).toBe('14:30');
        expect(parseQuickAdd('x @9h', now).dueTime).toBe('09:00');
        expect(parseQuickAdd('x @0:05', now).dueTime).toBe('00:05');
    });

    it('keeps unknown tokens, mentions and a lone symbol in the title', () => {
        expect(parseQuickAdd('Ping @marie about !stuff and @ now !', now)).toEqual({
            title: 'Ping @marie about !stuff and @ now !',
        });
    });

    it('collapses the spaces left by the removed words', () => {
        expect(parseQuickAdd('  Acheter   @demain   du pain  ', now).title).toBe('Acheter du pain');
    });

    it('gives an empty title when there is only metadata', () => {
        expect(parseQuickAdd('@demain !urgent', now)).toMatchObject({ title: '', priority: 'URGENT' });
    });

    it('keeps the last value when a token is repeated', () => {
        expect(parseQuickAdd('x !basse !haute @demain @+2j', now)).toMatchObject({
            priority: 'HIGH',
            dueDate: '2026-10-22',
        });
    });
});
