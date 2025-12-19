import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { COUNTRY_TIMEZONE } from "./constants"

export function cn(...inputs) {
    return twMerge(clsx(inputs))
}

export function getTimeZoneForCountry(country) {
    return COUNTRY_TIMEZONE[country] || "UTC";
}

export function fmt(dateStr, timeZone) {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        const df = new Intl.DateTimeFormat("fr-FR", {
            timeZone: timeZone || "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
        return df.format(d).replace(",", "");
    } catch {
        return String(dateStr);
    }
}

export function isoYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

export function endOfMonthYMD(d) {
    const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return isoYMD(dt);
}

export function inferFrequencyFromMode(mode) {
    if (mode === "week") return "week";
    if (mode === "month_to_date") return "month";
    return "day";
}

export function buildAutoExportConfig(freq) {
    if (freq === "week") {
        return {
            mode: "week",
            cron: "30 19 * * 5",
            fromOffset: 0,
            toOffset: 0
        };
    }
    if (freq === "month") {
        return {
            mode: "month_to_date",
            cron: "30 19 28-31 * *",
            fromOffset: 0,
            toOffset: 0
        };
    }
    return {
        mode: "day",
        cron: "30 19 * * *",
        fromOffset: 0,
        toOffset: 0
    };
}
