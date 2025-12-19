const {
    getTimeZoneForCountry,
    parseYMD,
    compareYMD,
    ymdToInt,
    shiftStartToNextBusinessDay,
    shiftEndToPreviousBusinessDay,
    buildStartEndISOForLocalRange,
    maxYMD,
    isBusinessDay,
    buildStartEndISOForLocalDay,
    addDaysYMD,
    mondayOfWeek,
    lastDayOfMonthYMD,
    addMonthsYMD,
    ymdFromDateInTZ
} = require("../utils/time");
const { getTasks } = require("../models/Task");
const { getStatuses, setStatus } = require("../models/Status");

function matchesSearch(it, q) {
    if (!q) return true;
    q = String(q).toLowerCase();
    return (
        String(it.description || "").toLowerCase().includes(q) ||
        String(it.procedure_url || "").toLowerCase().includes(q) ||
        String(it.periodicity || "").toLowerCase().includes(q)
    );
}

function overlapsRange(startA, endA, startB, endB) {
    return startA <= endB && endA >= startB;
}

function computeOccurences(task, fromYMD, toYMD, country) {
    const out = [];
    const tz = getTimeZoneForCountry(country);

    const startBase = parseYMD(task.start_date);
    if (!startBase) return out;

    let activeUntil = null;
    if (task.active_until) {
        const au = parseYMD(task.active_until);
        if (au) activeUntil = au;
    }

    const now = new Date();

    const pushInstance = (rangeStartYMD, rangeEndYMD) => {
        if (activeUntil && compareYMD(rangeStartYMD, activeUntil) > 0) return;

        let endYMD = { ...rangeEndYMD };
        if (activeUntil && compareYMD(endYMD, activeUntil) > 0) endYMD = { ...activeUntil };

        let startYMD = { ...rangeStartYMD };

        if (task.periodicity === "weekly" || task.periodicity === "monthly" || task.periodicity === "yearly") {
            startYMD = shiftStartToNextBusinessDay(country, startYMD);
            endYMD = shiftEndToPreviousBusinessDay(country, endYMD);
        }

        if (compareYMD(endYMD, startYMD) < 0) return;

        const sInt = ymdToInt(startYMD);
        const eInt = ymdToInt(endYMD);
        const fromInt = ymdToInt(fromYMD);
        const toInt = ymdToInt(toYMD);
        if (!overlapsRange(sInt, eInt, fromInt, toInt)) return;

        const { start_ts, end_ts } = buildStartEndISOForLocalRange(startYMD, endYMD, tz);

        let status = "pending";
        const endDateTime = new Date(end_ts);
        if (status === "pending" && endDateTime.getTime() < now.getTime()) status = "missing";

        out.push({
            task_id: task.id,
            periodicity: task.periodicity,
            description: task.description,
            procedure_url: task.procedure_url || "",
            start_ts,
            end_ts,
            status,
            comment: ""
        });
    };

    if (task.periodicity === "daily") {
        let cur = maxYMD(startBase, fromYMD);
        while (compareYMD(cur, toYMD) <= 0) {
            if (activeUntil && compareYMD(cur, activeUntil) > 0) break;

            if (isBusinessDay(country, cur)) {
                const { start_ts, end_ts } = buildStartEndISOForLocalDay(cur, tz);

                let status = "pending";
                const endDateTime = new Date(end_ts);
                if (status === "pending" && endDateTime.getTime() < now.getTime()) status = "missing";

                out.push({
                    task_id: task.id,
                    periodicity: task.periodicity,
                    description: task.description,
                    procedure_url: task.procedure_url || "",
                    start_ts,
                    end_ts,
                    status,
                    comment: ""
                });
            }
            cur = addDaysYMD(cur, 1);
        }
    }

    if (task.periodicity === "weekly") {
        const firstWeekMon = mondayOfWeek(startBase);

        let weekMon = mondayOfWeek(fromYMD);
        if (compareYMD(weekMon, firstWeekMon) < 0) weekMon = { ...firstWeekMon };

        while (compareYMD(weekMon, toYMD) <= 0) {
            const weekFri = addDaysYMD(weekMon, 4);
            pushInstance(weekMon, weekFri);
            weekMon = addDaysYMD(weekMon, 7);
        }
    }

    if (task.periodicity === "monthly") {
        const firstMonth = { y: startBase.y, m: startBase.m, d: 1 };

        let curMonth = { y: fromYMD.y, m: fromYMD.m, d: 1 };
        if (compareYMD(curMonth, firstMonth) < 0) curMonth = { ...firstMonth };

        while (compareYMD(curMonth, toYMD) <= 0) {
            const monthStart = { ...curMonth };
            const monthEndNominal = lastDayOfMonthYMD(curMonth.y, curMonth.m);
            pushInstance(monthStart, monthEndNominal);

            curMonth = addMonthsYMD(curMonth, 1);
            curMonth.d = 1;
        }
    }

    if (task.periodicity === "yearly") {
        const endBase = parseYMD(task.end_date);
        if (!endBase) return out;

        const startMonth = startBase.m;
        const startDay = startBase.d;
        const endMonth = endBase.m;
        const endDay = endBase.d;

        const safeDate = (y, m, d) => {
            let dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
            if (dt.getUTCMonth() !== (m - 1)) {
                dt = new Date(Date.UTC(y, m, 0, 0, 0, 0));
            }
            return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
        };

        const fromYear = fromYMD.y - 1;
        const toYear = toYMD.y + 1;

        for (let y = fromYear; y <= toYear; y++) {
            let rangeStart = safeDate(y, startMonth, startDay);
            let rangeEnd = safeDate(y, endMonth, endDay);

            if (compareYMD(rangeEnd, rangeStart) < 0) {
                rangeEnd = safeDate(y + 1, endMonth, endDay);
            }

            if (compareYMD(rangeEnd, startBase) < 0) continue;

            pushInstance(rangeStart, rangeEnd);
        }
    }

    return out;
}

async function buildInstances({ from, to, status, search }, country) {
    const fromYMD = parseYMD(from);
    const toYMD = parseYMD(to);
    if (!fromYMD || !toYMD) return [];

    const tasks = await getTasks();
    const statuses = await getStatuses();

    let instances = [];
    for (const task of tasks) {
        instances.push(...computeOccurences(task, fromYMD, toYMD, country));
    }

    // overlay explicit statuses
    for (const it of instances) {
        const key = `${it.task_id}|${it.start_ts}|${it.end_ts}`;
        const ov = statuses[key];
        if (ov && ov.status) {
            it.status = ov.status;
            it.comment = ov.comment || "";
        }
    }

    if (search) instances = instances.filter(it => matchesSearch(it, search));
    if (status) instances = instances.filter(it => it.status === status);

    const nowMs = Date.now();
    instances = instances.filter(it => {
        const s = Date.parse(it.start_ts);
        return Number.isFinite(s) && s <= nowMs;
    });

    return instances;
}

async function auditMissedInstances({ lookbackDays = 60 }, country) {
    const tz = getTimeZoneForCountry(country);
    const today = ymdFromDateInTZ(new Date(), tz);
    const fromYMD = addDaysYMD(today, -lookbackDays);
    const toYMD = today;

    const tasks = await getTasks();
    const statuses = await getStatuses();
    const nowMs = Date.now();

    for (const task of tasks) {
        const occ = computeOccurences(task, fromYMD, toYMD, country);
        for (const it of occ) {
            const key = `${it.task_id}|${it.start_ts}|${it.end_ts}`;
            if (statuses[key]?.status) continue;
            if (Date.parse(it.end_ts) >= nowMs) continue;
            await setStatus(key, "missing", "");
        }
    }
}

module.exports = {
    computeOccurences,
    buildInstances,
    auditMissedInstances
};
