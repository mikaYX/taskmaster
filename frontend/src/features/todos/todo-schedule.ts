/**
 * Lead times a person can pick for a reminder. `null` is "the default" (one day before),
 * the others are minutes before the due moment. Labels: `todos.remind.<key>`.
 */
export const REMIND_OPTIONS: { value: number | null; key: string }[] = [
    { value: null, key: 'default' },
    { value: 0, key: 'atDue' },
    { value: 15, key: 'min15' },
    { value: 60, key: 'hour1' },
    { value: 120, key: 'hour2' },
    { value: 1440, key: 'day1' },
    { value: 2880, key: 'day2' },
    { value: 10080, key: 'week1' },
];

/** The Select works with strings: '' stands for "the default". */
export const remindToSelect = (value: number | null) => (value === null ? 'default' : String(value));
export const selectToRemind = (value: string) => (value === 'default' ? null : Number(value));

/** `<input type="time">` gives "" when empty. */
export const DUE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
