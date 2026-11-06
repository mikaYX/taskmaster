/** 15 minutes to 24 hours, by steps of 15 minutes (the pace of the reminder job). */
export function minuteOptions(hours: number): number[] {
    if (hours === 24) return [0];
    if (hours === 0) return [15, 30, 45];
    return [0, 15, 30, 45];
}

export function nextReminderOffset(hours: number, minutes: number): number {
    const options = minuteOptions(hours);
    return hours * 60 + (options.includes(minutes) ? minutes : options[0]);
}

/** `90` -> `1 h 30`, `45` -> `45 min`, `60` -> `1 h`. */
export function formatReminderOffset(offset: number): string {
    const hours = Math.floor(offset / 60);
    const minutes = offset % 60;
    if (hours === 0) return `${minutes} min`;
    return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, "0")}`;
}
