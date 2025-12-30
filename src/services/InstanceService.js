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
    ymdFromDateInTZ,
    isWeekend,
    isHoliday,
    buildStartEndISOForCustomTimes
} = require("../utils/time");
const { getTasks, getTasksWithAssignments } = require("../models/Task");
const { getDelegationsForTask } = require("../models/TaskDelegation");
const { getStatuses, setStatus } = require("../models/Status");
const { getUsers } = require("../models/User");
const { getAllHnoGroups } = require("../models/HnoGroup");
const { getConfig } = require("../models/Config");

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

function computeOccurences(task, fromYMD, toYMD, country, delegations = [], hnoMap = null, sysSchedule = null) {
    const out = [];
    const tz = getTimeZoneForCountry(country);

    const getSched = (period) => {
        const def = { start: "08:00", end: "19:00" };
        if (!sysSchedule) return def;
        if (sysSchedule.mode === 'global') return sysSchedule.global || def;
        return sysSchedule[period] || def;
    };

    const startBase = parseYMD(task.start_date);
    if (!startBase) return out;

    let activeUntil = null;
    if (task.active_until) {
        const au = parseYMD(task.active_until);
        if (au) activeUntil = au;
    }

    const now = new Date();

    // Tasks logic for working days
    const skipW = task.skip_weekends !== 0; // Default 1 (skip)
    const skipH = task.skip_holidays !== 0; // Default 1 (skip)

    const isTaskDay = (ymd) => {
        if (skipW && isWeekend(ymd)) return false;
        if (skipH && isHoliday(country, ymd)) return false;
        return true;
    };

    const shiftStart = (ymd) => {
        let cur = { ...ymd };
        // Safety break to avoid infinite loop if everything is skipped (e.g. 365 holidays) - unlikely but good practice
        let safe = 0;
        while (!isTaskDay(cur) && safe < 366) {
            cur = addDaysYMD(cur, 1);
            safe++;
        }
        return cur;
    };
    const shiftEnd = (ymd) => {
        let cur = { ...ymd };
        let safe = 0;
        while (!isTaskDay(cur) && safe < 366) {
            cur = addDaysYMD(cur, -1);
            safe++;
        }
        return cur;
    };

    const pushInstance = (rangeStartYMD, rangeEndYMD) => {
        if (activeUntil && compareYMD(rangeStartYMD, activeUntil) > 0) return;

        let endYMD = { ...rangeEndYMD };
        if (activeUntil && compareYMD(endYMD, activeUntil) > 0) endYMD = { ...activeUntil };

        let startYMD = { ...rangeStartYMD };

        if (task.periodicity === "weekly" || task.periodicity === "monthly" || task.periodicity === "yearly") {
            startYMD = shiftStart(startYMD);
            endYMD = shiftEnd(endYMD);
        }

        if (compareYMD(endYMD, startYMD) < 0) return;

        const sInt = ymdToInt(startYMD);
        const eInt = ymdToInt(endYMD);
        const fromInt = ymdToInt(fromYMD);
        const toInt = ymdToInt(toYMD);
        if (!overlapsRange(sInt, eInt, fromInt, toInt)) return;

        if (!overlapsRange(sInt, eInt, fromInt, toInt)) return;

        // Custom Schedule Logic for Ranges (Weekly, Monthly, Yearly)
        const { start, end } = getSched(task.periodicity);
        // We use buildStartEndISOForCustomTimes trick: calculate start on startYMD, end on endYMD
        // Note: For multi-day ranges, crossDay logic applies to the *times* on those specific days, 
        // but since it's a range, we just want StartTime on StartDay and EndTime on EndDay.
        const sT = buildStartEndISOForCustomTimes(startYMD, start, end, false, tz).start_ts;
        const eT = buildStartEndISOForCustomTimes(endYMD, start, end, false, tz).end_ts;
        const start_ts = sT;
        const end_ts = eT;

        let status = "pending";
        const endDateTime = new Date(end_ts);
        if (status === "pending" && endDateTime.getTime() < now.getTime()) status = "missing";

        const instance = {
            task_id: task.id,
            periodicity: task.periodicity,
            description: task.description,
            procedure_url: task.procedure_url || "",
            start_ts,
            end_ts,
            status,
            comment: "",
            assigned_group: task.assigned_group,
            assigned_groups: task.assigned_groups,
            assigned_user_ids: task.assigned_user_ids,
            assigned_user_id: task.assigned_user_id,
            assigned_usernames: task.assigned_usernames,
            assigned_fullnames: task.assigned_fullnames
        };

        if (delegations && delegations.length > 0) {
            const sStr = `${startYMD.y}-${String(startYMD.m).padStart(2, '0')}-${String(startYMD.d).padStart(2, '0')}`;
            const activeDelegation = delegations.find(d => sStr >= d.start_date && sStr <= d.end_date);

            if (activeDelegation) {
                instance.assigned_user_ids = [activeDelegation.delegate_user_id];
                instance.assigned_user_id = activeDelegation.delegate_user_id;
                instance.assigned_groups = [];
                instance.assigned_group = null;
                instance.assigned_usernames = [activeDelegation.delegate_username];
                instance.assigned_fullnames = [activeDelegation.delegate_fullname || ''];
                instance.is_delegated = true;
            }
        }

        out.push(instance);
    };

    if (task.periodicity === "daily") {
        let cur = maxYMD(startBase, fromYMD);
        while (compareYMD(cur, toYMD) <= 0) {
            if (activeUntil && compareYMD(cur, activeUntil) > 0) break;

            if (activeUntil && compareYMD(cur, activeUntil) > 0) break;

            if (isTaskDay(cur)) {
                // Custom Schedule for Daily
                const { start, end } = getSched("daily");
                const [sH, sM] = start.split(':').map(Number);
                const [eH, eM] = end.split(':').map(Number);
                const crossDay = (eH < sH) || (eH === sH && eM < sM);

                const { start_ts, end_ts } = buildStartEndISOForCustomTimes(cur, start, end, crossDay, tz);

                let status = "pending";
                const endDateTime = new Date(end_ts);
                if (status === "pending" && endDateTime.getTime() < now.getTime()) status = "missing";

                const instance = {
                    task_id: task.id,
                    periodicity: task.periodicity,
                    description: task.description,
                    procedure_url: task.procedure_url || "",
                    start_ts,
                    end_ts,
                    status,
                    comment: "",
                    assigned_group: task.assigned_group,
                    assigned_groups: task.assigned_groups,
                    assigned_user_ids: task.assigned_user_ids,
                    assigned_user_id: task.assigned_user_id,
                    assigned_usernames: task.assigned_usernames,
                    assigned_fullnames: task.assigned_fullnames
                };

                if (delegations && delegations.length > 0) {
                    const sStr = `${cur.y}-${String(cur.m).padStart(2, '0')}-${String(cur.d).padStart(2, '0')}`;
                    const activeDelegation = delegations.find(d => sStr >= d.start_date && sStr <= d.end_date);

                    if (activeDelegation) {
                        instance.assigned_user_ids = [activeDelegation.delegate_user_id];
                        instance.assigned_user_id = activeDelegation.delegate_user_id;
                        instance.assigned_groups = [];
                        instance.assigned_group = null;
                        instance.assigned_usernames = [activeDelegation.delegate_username];
                        instance.assigned_fullnames = [activeDelegation.delegate_fullname || ''];
                        instance.is_delegated = true;
                    }
                }

                out.push(instance);
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

    if (task.periodicity === "hno") {
        const grp = hnoMap && task.hno_group_id ? hnoMap.get(task.hno_group_id) : null;
        if (grp && grp.days) {
            const gDays = String(grp.days).split(',').map(Number);
            const [sH, sM] = (grp.start_time || "00:00").split(':').map(Number);
            const [eH, eM] = (grp.end_time || "00:00").split(':').map(Number);
            const crossDay = (eH < sH) || (eH === sH && eM < sM);

            let cur = maxYMD(startBase, fromYMD);
            while (compareYMD(cur, toYMD) <= 0) {
                if (activeUntil && compareYMD(cur, activeUntil) > 0) break;

                if (skipH && isHoliday(country, cur)) {
                    cur = addDaysYMD(cur, 1);
                    continue;
                }

                const dt = new Date(Date.UTC(cur.y, cur.m - 1, cur.d));
                const dow = dt.getUTCDay();

                if (gDays.includes(dow)) {
                    const { start_ts, end_ts } = buildStartEndISOForCustomTimes(cur, grp.start_time, grp.end_time, crossDay, tz);

                    let status = "pending";
                    const endDateTime = new Date(end_ts);
                    if (status === "pending" && endDateTime.getTime() < now.getTime()) status = "missing";

                    const instance = {
                        task_id: task.id,
                        periodicity: "hno",
                        description: task.description,
                        procedure_url: task.procedure_url || "",
                        start_ts,
                        end_ts,
                        status,
                        comment: "",
                        assigned_group: task.assigned_group,
                        assigned_groups: task.assigned_groups,
                        assigned_user_ids: task.assigned_user_ids,
                        assigned_user_id: task.assigned_user_id,
                        assigned_usernames: task.assigned_usernames,
                        assigned_fullnames: task.assigned_fullnames,
                        is_hno: true,
                        hno_group_name: grp.name
                    };

                    if (delegations && delegations.length > 0) {
                        const sStr = `${cur.y}-${String(cur.m).padStart(2, '0')}-${String(cur.d).padStart(2, '0')}`;
                        const activeDelegation = delegations.find(d => sStr >= d.start_date && sStr <= d.end_date);
                        if (activeDelegation) {
                            instance.assigned_user_ids = [activeDelegation.delegate_user_id];
                            instance.assigned_user_id = activeDelegation.delegate_user_id;
                            instance.assigned_groups = [];
                            instance.assigned_group = null;
                            instance.assigned_usernames = [activeDelegation.delegate_username];
                            instance.assigned_fullnames = [activeDelegation.delegate_fullname || ''];
                            instance.is_delegated = true;
                        }
                    }

                    out.push(instance);
                }
                cur = addDaysYMD(cur, 1);
            }
        }
    }

    return out;
}

async function buildInstances({ from, to, status, search, periodicity, includeFuture, userId, groupId, isDelegated }, country) {
    const fromYMD = parseYMD(from);
    const toYMD = parseYMD(to);
    if (!fromYMD || !toYMD) return [];

    const tasks = await getTasksWithAssignments();
    const statuses = await getStatuses();
    const allUsers = await getUsers({ includeDeleted: true });
    const userMap = new Map(allUsers.map(u => [u.id, u.username]));
    const fullnameMap = new Map(allUsers.map(u => [u.id, u.fullname]));
    const usersObjMap = new Map(allUsers.map(u => [parseInt(u.id, 10), u]));

    const allHnoGroups = await getAllHnoGroups();
    const hnoMap = new Map(allHnoGroups.map(g => [g.id, g]));

    const cfg = await getConfig();
    const sysSchedule = cfg.sys_schedule || null;

    let targetUser = null;
    if (userId && userId !== 'all') {
        targetUser = usersObjMap.get(parseInt(userId, 10));
    }

    let instances = [];
    for (const task of tasks) {
        // Filter by periodicity early if requested
        if (periodicity && periodicity !== 'all' && task.periodicity !== periodicity) continue;

        // Filter by group early if requested (assigned_groups or assigned_group legacy)
        if (groupId && groupId !== 'all') {
            const hasGroup = (task.assigned_groups || []).includes(groupId) || (task.assigned_group === groupId);
            if (!hasGroup) continue;
        }

        // Populate usernames and fullnames
        if (task.assigned_user_ids && task.assigned_user_ids.length > 0) {
            task.assigned_usernames = task.assigned_user_ids.map(id => userMap.get(id) || `User ${id}`);
            task.assigned_fullnames = task.assigned_user_ids.map(id => fullnameMap.get(id) || '');
        }
        const taskDelegations = await getDelegationsForTask(task.id);

        let taskInstances = computeOccurences(task, fromYMD, toYMD, country, taskDelegations, hnoMap, sysSchedule);

        // Filter by specific user if requested
        if (targetUser) {
            const myId = targetUser.id;
            const myGroups = targetUser.groups || [];

            taskInstances = taskInstances.filter(it => {
                // If it's a specific instance that we need to check delegation for
                // Note: it already has is_delegated and assigned_user_ids (which contains the delegate)
                // BUT assigned_user_ids in 'it' is the list of users who can DO the task for THIS instance.

                const assignedIds = (it.assigned_user_ids || []).map(Number);
                const assignedGroups = [...(task.assigned_groups || [])];
                if (task.assigned_group && task.assigned_group !== 'all' && !assignedGroups.includes(task.assigned_group)) {
                    assignedGroups.push(task.assigned_group);
                }

                const isAssignedUser = assignedIds.includes(myId);
                const isAssignedGroup = assignedGroups.some(g => myGroups.includes(g));
                const isUnassigned = assignedIds.length === 0 && assignedGroups.length === 0;

                // User filter should show what's assigned to THEM, their GROUPS, or if UNASSIGNED (available to everyone)
                // and most importantly: if they are the DELEGATE for that day.
                return isUnassigned || isAssignedUser || isAssignedGroup;
            });
        }

        instances.push(...taskInstances);
    }

    // overlay explicit statuses
    for (const it of instances) {
        const key = `${it.task_id}|${it.start_ts}|${it.end_ts}`;
        const ov = statuses[key];
        if (ov && ov.status) {
            it.status = ov.status;
            it.comment = ov.comment || "";
            it.updated_by_user_id = ov.updated_by_user_id;
            it.updated_by_username = ov.updated_by_username;
        }
    }

    if (search) instances = instances.filter(it => matchesSearch(it, search));
    if (status && status !== 'all') instances = instances.filter(it => it.status === status);
    if (includeFuture === false) { // Strict check, undefined implies true or false depending on context? In function sig default is undefined.
        // logic below handles default:
    }

    // Filter by delegated if requested
    if (isDelegated === true) {
        instances = instances.filter(it => it.is_delegated === true);
    }

    const nowMs = Date.now();
    // Filter out future tasks by default (Dashboard view)
    // We want to hide tasks that haven't started yet (s > nowMs), even if we are filtering by status (e.g. "pending").
    // Exceptions: 
    // - includeFuture is true (used by internal jobs)
    // - Maybe if searching? No, usually we search current tasks. But user might want to search future? 
    //   The user said "I see all future tasks in pending... I should not". So we enforce it even for search/status.

    if (!includeFuture) {
        instances = instances.filter(it => {
            const s = Date.parse(it.start_ts);
            return Number.isFinite(s) && s <= nowMs;
        });
    }

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
        const taskDelegations = await getDelegationsForTask(task.id);
        // We might need hnoMap here too if we want to audit HNO tasks. 
        // For now, let's load it or skip. Loading it is safer.
        const allHnoGroups = await getAllHnoGroups();
        const hnoMap = new Map(allHnoGroups.map(g => [g.id, g]));
        const cfg = await getConfig();
        const sysSchedule = cfg.sys_schedule || null;

        const occ = computeOccurences(task, fromYMD, toYMD, country, taskDelegations, hnoMap, sysSchedule);
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
