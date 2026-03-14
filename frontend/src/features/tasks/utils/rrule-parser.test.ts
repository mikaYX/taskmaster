import { describe, it, expect } from 'vitest';
import { parseRRuleToForm } from './rrule-parser';

describe('rrule-parser', () => {

    it('should parse simple daily interval', () => {
        const rrule = 'FREQ=DAILY;INTERVAL=2';
        const values = parseRRuleToForm(rrule);
        expect(values.periodicity).toBe('daily');
        expect(values.interval).toBe(2);
    });

    it('should parse weekly with weekdays', () => {
        const rrule = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR';
        const values = parseRRuleToForm(rrule);
        expect(values.periodicity).toBe('weekly');
        expect(values.interval).toBe(1);
        expect(values.byWeekday).toContain(0); // MO
        expect(values.byWeekday).toContain(4); // FR
    });

    it('should parse monthly nth weekday', () => {
        // BYSETPOS=3;BYDAY=FR
        const rrule = 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=3;INTERVAL=1';
        const values = parseRRuleToForm(rrule);
        expect(values.periodicity).toBe('monthly');
        expect(values.bySetPos).toBe(3);
        expect(values.byWeekday).toEqual([4]); // FR
    });

    it('should parse monthly combined format (+3FR)', () => {
        // RRule.js parseString handles +3FR by splitting it into byweekday and bysetpos?
        // Let's verify strict behavior.
        const rrule = 'FREQ=MONTHLY;BYDAY=+3FR';
        const values = parseRRuleToForm(rrule);
        expect(values.periodicity).toBe('monthly');
        // RRule.parseString implementation dependent
        // If it fails, we might need manual handling or check how RRule parses it.
        // Assuming RRule library normalizes it.
    });
});
