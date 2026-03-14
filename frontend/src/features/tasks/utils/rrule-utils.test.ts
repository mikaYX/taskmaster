import { describe, it, expect } from 'vitest';
import { generateRRuleFromForm } from './rrule-utils';
import { RRule } from 'rrule';

describe('rrule-utils', () => {
    const baseDate = new Date('2024-01-01T10:00:00.000Z'); // Monday

    it('should generate daily interval pattern', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'daily',
            startDate: baseDate,
            interval: 2
        });
        expect(rrule).toContain('FREQ=DAILY');
        expect(rrule).toContain('INTERVAL=2');
    });

    it('should generate weekly interval pattern', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'weekly',
            startDate: baseDate,
            interval: 3
        });
        expect(rrule).toContain('FREQ=WEEKLY');
        expect(rrule).toContain('INTERVAL=3');
    });

    it('should generate monthly specific day pattern', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'monthly',
            startDate: baseDate,
            interval: 1,
            byMonthDay: 15
        });
        expect(rrule).toContain('FREQ=MONTHLY');
        expect(rrule).toContain('BYMONTHDAY=15');
    });

    it('should generate monthly nth weekday pattern (3rd Friday)', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'monthly',
            startDate: baseDate,
            interval: 1,
            bySetPos: 3,
            byWeekday: [RRule.FR.weekday] // Friday = 4
        });
        console.log('Nth Weekday RRule:', rrule);

        expect(rrule).toBeDefined();
        if (!rrule) return;

        expect(rrule).toContain('FREQ=MONTHLY');

        // RRule.js usually outputs BYDAY=+3FR for 3rd Friday, or BYSETPOS=3;BYDAY=FR
        // Using flexible check
        const hasSetPos = rrule.includes('BYSETPOS=3');
        const hasByDay = rrule.includes('BYDAY=FR'); // Only if separated

        const hasCombined = rrule.includes('BYDAY=+3FR') || rrule.includes('BYDAY=3FR');

        // Either separated parts exist OR combined exists
        const valid = (hasSetPos && hasByDay) || hasCombined;

        if (!valid) {
            console.error('Invalid RRule format for Nth Weekday:', rrule);
        }
        expect(valid).toBe(true);
    });

    it('should generate monthly last weekday pattern', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'monthly',
            startDate: baseDate,
            bySetPos: -1,
            byWeekday: [RRule.MO.weekday]
        });
        expect(rrule).toContain('FREQ=MONTHLY');
        // Expect BYSETPOS=-1 or BYDAY=-1MO
    });

    it('should generate custom every x days', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'every_x_days',
            startDate: baseDate,
            interval: 5
        });
        expect(rrule).toContain('FREQ=DAILY');
        expect(rrule).toContain('INTERVAL=5');
    });

    it('should generate custom selected weekdays', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'selected_weekdays',
            startDate: baseDate,
            interval: 1,
            byWeekday: [RRule.MO.weekday, RRule.WE.weekday]
        });
        expect(rrule).toContain('FREQ=WEEKLY');
        expect(rrule).toContain('BYDAY=MO,WE');
    });

    it('should generate custom weeks of month', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'weeks_of_month',
            startDate: baseDate,
            interval: 2,
            bySetPos: 1,
            byWeekday: [RRule.TU.weekday]
        });
        expect(rrule).toContain('FREQ=MONTHLY');
        expect(rrule).toContain('INTERVAL=2');
        expect(rrule).toContain('BYSETPOS=1');
    });

    it('should generate custom days of year', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'days_of_year',
            startDate: baseDate,
            interval: 1,
            byYearDay: [1, 150, 365]
        });
        expect(rrule).toContain('FREQ=YEARLY');
        expect(rrule).toContain('BYYEARDAY=1,150,365');
    });

    it('should generate custom selected weekdays with isContinuousBlock true', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'selected_weekdays',
            startDate: baseDate,
            interval: 1,
            byWeekday: [RRule.MO.weekday, RRule.WE.weekday, RRule.FR.weekday],
            isContinuousBlock: true
        });
        expect(rrule).toContain('FREQ=WEEKLY');
        expect(rrule).toContain('BYDAY=MO');
        expect(rrule).not.toContain('BYDAY=MO,WE');
        expect(rrule).not.toContain('BYDAY=MO,WE,FR');
    });

    it('should generate custom weeks of month with isContinuousBlock true', () => {
        const rrule = generateRRuleFromForm({
            periodicity: 'custom',
            customRuleType: 'weeks_of_month',
            startDate: baseDate,
            interval: 2,
            bySetPos: 1,
            byWeekday: [RRule.TU.weekday, RRule.TH.weekday],
            isContinuousBlock: true
        });
        expect(rrule).toContain('FREQ=MONTHLY');
        expect(rrule).toContain('BYDAY=TU');
        expect(rrule).not.toContain('BYDAY=TU,TH');
        expect(rrule).toContain('BYSETPOS=1');
    });
});

