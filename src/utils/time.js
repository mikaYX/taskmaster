const HolidaysLib = require("date-holidays");

// -------------------- Timezone helpers --------------------
const COUNTRY_TIMEZONE = {
    FR: "Europe/Paris",
    US: "America/New_York",
    ES: "Europe/Madrid",
    UK: "Europe/London",
    DE: "Europe/Berlin",
    RO: "Europe/Bucharest",
    TN: "Africa/Tunis",
    CH: "Europe/Zurich",
    TR: "Europe/Istanbul"
};

const COUNTRY_TO_HOLIDAY_CODE = {
    UK: "GB"
};

function getTimeZoneForCountry(country) {
    return COUNTRY_TIMEZONE[country] || "UTC";
}

function tzParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const p of parts) {
        if (p.type !== "literal") map[p.type] = p.value;
    }
    return {
        year: parseInt(map.year, 10),
        month: parseInt(map.month, 10),
        day: parseInt(map.day, 10),
        hour: parseInt(map.hour, 10),
        minute: parseInt(map.minute, 10),
        second: parseInt(map.second, 10)
    };
}

function tzOffsetMinutes(date, timeZone) {
    const p = tzParts(date, timeZone);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return (asUTC - date.getTime()) / 60000;
}

function zonedToUtcDate({ y, m, d, hh, mm, ss }, timeZone) {
    const approx = new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0));
    const offset = tzOffsetMinutes(approx, timeZone);
    return new Date(approx.getTime() - offset * 60000);
}

function ymdFromDateInTZ(date, timeZone) {
    const p = tzParts(date, timeZone);
    return { y: p.year, m: p.month, d: p.day };
}

function ymdToString(ymd) {
    const y = String(ymd.y).padStart(4, "0");
    const m = String(ymd.m).padStart(2, "0");
    const d = String(ymd.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseYMD(s) {
    const [y, m, d] = String(s || "").split("-").map(v => parseInt(v, 10));
    if (!y || !m || !d) return null;
    return { y, m, d };
}

function ymdToInt(ymd) {
    return (ymd.y * 10000) + (ymd.m * 100) + ymd.d;
}

function addDaysYMD(ymd, n) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + n);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addMonthsYMD(ymd, n) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0));
    dt.setUTCMonth(dt.getUTCMonth() + n);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function compareYMD(a, b) {
    return ymdToInt(a) - ymdToInt(b);
}

function maxYMD(a, b) {
    return compareYMD(a, b) >= 0 ? a : b;
}

function isWeekend(ymd) {
    const dow = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay(); // 0 Sun..6 Sat
    return dow === 0 || dow === 6;
}

function mondayOfWeek(ymd) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    const dow = dt.getUTCDay();
    const monBased = (dow + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - monBased);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function lastDayOfMonthYMD(year, month) {
    const dt = new Date(Date.UTC(year, month, 0));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isLastDayOfMonthInTZ(country) {
    const tz = getTimeZoneForCountry(country);
    const today = ymdFromDateInTZ(new Date(), tz);
    const last = lastDayOfMonthYMD(today.y, today.m);
    return today.y === last.y && today.m === last.m && today.d === last.d;
}

// -------------------- Holiday helper --------------------
const hdCache = new Map();

function getHolidayEngine(country) {
    const code = COUNTRY_TO_HOLIDAY_CODE[country] || country;
    if (!hdCache.has(code)) {
        try {
            const hd = new HolidaysLib(code);
            hdCache.set(code, hd);
        } catch {
            hdCache.set(code, null);
        }
    }
    return hdCache.get(code);
}

function isHoliday(country, ymd) {
    const hd = getHolidayEngine(country);
    if (!hd) return false;
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12, 0, 0));
    return !!hd.isHoliday(dt);
}

function isBusinessDay(country, ymd) {
    if (isWeekend(ymd)) return false;
    if (isHoliday(country, ymd)) return false;
    return true;
}

function shiftStartToNextBusinessDay(country, ymd) {
    let cur = { ...ymd };
    while (!isBusinessDay(country, cur)) {
        cur = addDaysYMD(cur, +1);
    }
    return cur;
}

function shiftEndToPreviousBusinessDay(country, ymd) {
    let cur = { ...ymd };
    while (!isBusinessDay(country, cur)) {
        cur = addDaysYMD(cur, -1);
    }
    return cur;
}

function buildStartEndISOForLocalDay(ymd, timeZone) {
    const startUtc = zonedToUtcDate({ y: ymd.y, m: ymd.m, d: ymd.d, hh: 8, mm: 0, ss: 0 }, timeZone);
    const endUtc = zonedToUtcDate({ y: ymd.y, m: ymd.m, d: ymd.d, hh: 19, mm: 0, ss: 0 }, timeZone);
    return { start_ts: startUtc.toISOString(), end_ts: endUtc.toISOString() };
}

function buildStartEndISOForLocalRange(startYMD, endYMD, timeZone) {
    const startUtc = zonedToUtcDate({ y: startYMD.y, m: startYMD.m, d: startYMD.d, hh: 8, mm: 0, ss: 0 }, timeZone);
    const endUtc = zonedToUtcDate({ y: endYMD.y, m: endYMD.m, d: endYMD.d, hh: 19, mm: 0, ss: 0 }, timeZone);
    return { start_ts: startUtc.toISOString(), end_ts: endUtc.toISOString() };
}

function nowIso() {
    return new Date().toISOString();
}

module.exports = {
    getTimeZoneForCountry,
    nowIso,
    isLastDayOfMonthInTZ,
    shiftStartToNextBusinessDay,
    shiftEndToPreviousBusinessDay,
    buildStartEndISOForLocalDay,
    buildStartEndISOForLocalRange,
    buildStartEndISOForCustomTimes: (ymd, startHM, endHM, crossDay, timeZone) => {
        const [sH, sM] = startHM.split(':').map(Number);
        const [eH, eM] = endHM.split(':').map(Number);
        const startUtc = zonedToUtcDate({ y: ymd.y, m: ymd.m, d: ymd.d, hh: sH, mm: sM, ss: 0 }, timeZone);

        // If crossDay is true, add 1 day to end date logic
        // But zonedToUtcDate takes ymd. We handle crossDay logic outside or here?
        // Let's handle it here: if crossDay, modify the YMD passed to end.
        let endYmd = { ...ymd };
        if (crossDay) {
            const dt = new Date(Date.UTC(endYmd.y, endYmd.m - 1, endYmd.d));
            dt.setUTCDate(dt.getUTCDate() + 1);
            endYmd = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
        }

        const endUtc = zonedToUtcDate({ y: endYmd.y, m: endYmd.m, d: endYmd.d, hh: eH, mm: eM, ss: 0 }, timeZone);
        return { start_ts: startUtc.toISOString(), end_ts: endUtc.toISOString() };
    },
    ymdFromDateInTZ,
    ymdToString,
    parseYMD,
    addDaysYMD,
    addMonthsYMD,
    compareYMD,
    ymdToInt,
    maxYMD,
    isBusinessDay,
    isHoliday,
    isWeekend,
    lastDayOfMonthYMD,
    mondayOfWeek
};
