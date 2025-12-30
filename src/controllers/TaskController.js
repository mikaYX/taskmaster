const { getTasks, getTaskById, insertTask, updateTask, deleteTaskCascade, getTaskAssignments, getTaskGroupAssignments, getTasksWithAssignments } = require("../models/Task");
const { getActiveDelegationForTask } = require("../models/TaskDelegation");
const { getConfig } = require("../models/Config");
const { getTimeZoneForCountry, ymdFromDateInTZ, mondayOfWeek, ymdToString, parseYMD, nowIso } = require("../utils/time");
const { getUsers } = require("../models/User");

function normalizeStartDateOnCreate(periodicity, cfgCountry, inputStartDateStr) {
    const tz = getTimeZoneForCountry(cfgCountry);
    const today = ymdFromDateInTZ(new Date(), tz);

    if (periodicity === "weekly") {
        const mon = mondayOfWeek(today);
        return ymdToString(mon);
    }
    if (periodicity === "monthly") {
        const first = { y: today.y, m: today.m, d: 1 };
        return ymdToString(first);
    }

    const inYMD = parseYMD(inputStartDateStr);
    return inYMD ? ymdToString(inYMD) : null;
}

function normalizeStartDateOnUpdate(periodicity, cfgCountry, inputStartDateStr) {
    return normalizeStartDateOnCreate(periodicity, cfgCountry, inputStartDateStr);
}

async function listTasks(req, res) {
    const tasks = await getTasksWithAssignments();
    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");
    const today = ymdToString(ymdFromDateInTZ(new Date(), tz));

    const allUsers = await getUsers({ includeDeleted: true });
    const userMap = new Map(allUsers.map(u => [u.id, u.username]));
    const fullnameMap = new Map(allUsers.map(u => [u.id, u.fullname]));

    for (const t of tasks) {
        const d = await getActiveDelegationForTask(t.id, today);
        if (d) {
            t.active_delegation = d;
        }
        // Populate usernames and fullnames for frontend display
        if (t.assigned_user_ids && t.assigned_user_ids.length > 0) {
            t.assigned_usernames = t.assigned_user_ids.map(id => userMap.get(id) || `User ${id}`);
            t.assigned_fullnames = t.assigned_user_ids.map(id => fullnameMap.get(id) || '');
        }
    }

    if (cfg.app_mode === 'team' && req.auth && req.auth.role !== 'admin') {
        // Filter tasks assigned to this user or unassigned
        const uid = parseInt(req.auth.id, 10);
        const filtered = tasks.filter(t => {
            // Show if no assignments (everyone) or if user is in assigned list
            return !t.assigned_user_ids || t.assigned_user_ids.length === 0 || t.assigned_user_ids.includes(uid);
        });
        return res.json(filtered);
    }

    res.json(tasks);
}

async function createTask(req, res) {
    const cfg = await getConfig();
    const { periodicity, description, procedure_url, start_date, end_date, assigned_user_ids, assigned_groups, skip_weekends, skip_holidays, hno_group_id } = req.body || {};

    if (!periodicity || !description || !start_date) {
        return res.status(400).json({ error: "Missing fields" });
    }
    if (periodicity === "yearly" && !end_date) {
        return res.status(400).json({ error: "end_date required for yearly" });
    }

    const normalizedStart = normalizeStartDateOnCreate(periodicity, cfg.country || "FR", start_date);
    if (!normalizedStart) return res.status(400).json({ error: "Invalid start_date" });

    const normalizedEnd = end_date ? (parseYMD(end_date) ? ymdToString(parseYMD(end_date)) : null) : "";
    if (periodicity === "yearly" && !normalizedEnd) return res.status(400).json({ error: "Invalid end_date" });

    const tasks = await getTasks();
    const id = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1;

    const task = {
        id,
        periodicity,
        description,
        procedure_url: procedure_url || "",
        start_date: normalizedStart,
        end_date: normalizedEnd || "",
        active_until: "",
        created_at: nowIso(),
        updated_at: nowIso(),
        assigned_user_ids: assigned_user_ids || null,
        assigned_groups: assigned_groups || null,
        skip_weekends: skip_weekends ? 1 : 0,
        skip_holidays: skip_holidays ? 1 : 0,
        hno_group_id: hno_group_id ? parseInt(hno_group_id) : null
    };

    await insertTask(task);
    res.json({ ok: true, id });
}

async function updateTaskById(req, res) {
    const id = parseInt(req.params.id, 10);
    const cur = await getTaskById(id);
    if (!cur) return res.status(404).json({ error: "Not found" });

    const cfg = await getConfig();

    // Check permission in Team Mode
    // Check permission in Team Mode
    if (cfg.app_mode === 'team' && req.auth && req.auth.role !== 'admin') {
        const uid = parseInt(req.auth.id, 10);
        const uGroups = req.auth.groups || [];

        const tAssigns = await getTaskAssignments(id);
        const tGroups = await getTaskGroupAssignments(id);

        // Merge legacy
        if (cur.assigned_user_id) tAssigns.push(cur.assigned_user_id);
        if (cur.assigned_group && cur.assigned_group !== 'all') tGroups.push(cur.assigned_group);

        const isUnassigned = tAssigns.length === 0 && tGroups.length === 0;
        const isAssigned = tAssigns.includes(uid);
        const isGroup = tGroups.some(g => uGroups.includes(g));

        if (!isUnassigned && !isAssigned && !isGroup) {
            return res.status(403).json({ error: "Access denied" });
        }
    }
    const payload = req.body || {};

    const nextPeriodicity = payload.periodicity ?? cur.periodicity;

    let nextStart = payload.start_date ?? cur.start_date;
    if (payload.start_date || payload.periodicity) {
        const norm = normalizeStartDateOnUpdate(nextPeriodicity, cfg.country || "FR", nextStart);
        if (!norm) return res.status(400).json({ error: "Invalid start_date" });
        nextStart = norm;
    }

    let nextEnd = payload.end_date ?? cur.end_date;
    if (nextPeriodicity === "yearly") {
        if (!nextEnd) return res.status(400).json({ error: "end_date required for yearly" });
        const parsed = parseYMD(nextEnd);
        if (!parsed) return res.status(400).json({ error: "Invalid end_date" });
        nextEnd = ymdToString(parsed);
    } else {
        if (payload.end_date) {
            const parsed = parseYMD(payload.end_date);
            if (!parsed) return res.status(400).json({ error: "Invalid end_date" });
            nextEnd = ymdToString(parsed);
        }
    }

    const ok = await updateTask(id, {
        periodicity: nextPeriodicity,
        description: payload.description ?? undefined,
        procedure_url: payload.procedure_url ?? undefined,
        start_date: nextStart,
        end_date: nextEnd,
        active_until: payload.active_until ?? undefined,
        assigned_user_ids: payload.assigned_user_ids !== undefined ? payload.assigned_user_ids : undefined,
        assigned_groups: payload.assigned_groups !== undefined ? payload.assigned_groups : undefined,
        assigned_group: payload.assigned_group !== undefined ? payload.assigned_group : undefined,
        skip_weekends: payload.skip_weekends !== undefined ? (payload.skip_weekends ? 1 : 0) : undefined,
        skip_holidays: payload.skip_holidays !== undefined ? (payload.skip_holidays ? 1 : 0) : undefined,
        hno_group_id: payload.hno_group_id !== undefined ? (payload.hno_group_id ? parseInt(payload.hno_group_id) : null) : undefined
    });

    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
}

async function stopTask(req, res) {
    const id = parseInt(req.params.id, 10);
    const cur = await getTaskById(id);
    if (!cur) return res.status(404).json({ error: "Not found" });

    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");
    const today = ymdToString(ymdFromDateInTZ(new Date(), tz));

    await updateTask(id, { active_until: today });
    res.json({ ok: true, active_until: today });
}

async function removeTask(req, res) {
    const id = parseInt(req.params.id, 10);
    const ok = await deleteTaskCascade(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
}

async function checkUserDependencies(req, res) {
    const userId = parseInt(req.body.userId, 10);
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    // Include deleted users just in case, though usually we check before delete.
    const allTasks = await getTasksWithAssignments();

    // Filter for future tasks assigned to this user
    // "Future" means: 
    // - active_until is empty or > today
    // - end_date is empty or > today
    // - assigned to user

    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");
    const today = ymdToString(ymdFromDateInTZ(new Date(), tz));

    const dependencies = allTasks.filter(t => {
        const assigned = t.assigned_user_ids && t.assigned_user_ids.includes(userId);
        if (!assigned) return false;

        if (t.active_until && t.active_until < today) return false;
        if (t.end_date && t.end_date < today) return false;

        return true;
    });

    res.json({ count: dependencies.length, tasks: dependencies.map(t => ({ id: t.id, description: t.description })) });
}

async function reassignUserTasks(req, res) {
    const { oldUserId, newUserId, newGroupId } = req.body;
    const oldUid = parseInt(oldUserId, 10);

    if (!oldUid) return res.status(400).json({ error: "Missing oldUserId" });
    if (!newUserId && !newGroupId) return res.status(400).json({ error: "Must provide new assignments" });

    const allTasks = await getTasksWithAssignments();
    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");
    const today = ymdToString(ymdFromDateInTZ(new Date(), tz));

    let count = 0;

    for (const t of allTasks) {
        if (!t.assigned_user_ids || !t.assigned_user_ids.includes(oldUid)) continue;

        // Check if future? Ideally reassign all, history is preserved by "assigned_usernames" snapshot?
        // Wait, history snapshot is computed dynamic from `assigned_user_ids`.
        // If I change `assigned_user_ids` in the past tasks, I rewrite history to say "Bob did it" instead of "Alice".
        // Use Case: User Deletion.
        // Prompt: "Past task instances should retain the historical assignment information".
        // "For future tasks... reassign".
        // So I must ONLY reassign future tasks.

        const isFuture = (!t.active_until || t.active_until >= today) && (!t.end_date || t.end_date >= today);

        if (!isFuture) continue;

        // Update assignments
        const nextUserIds = new Set(t.assigned_user_ids);
        nextUserIds.delete(oldUid);
        if (newUserId) nextUserIds.add(parseInt(newUserId, 10));

        const nextGroups = new Set(t.assigned_groups || []);
        if (newGroupId) nextGroups.add(newGroupId);

        await updateTask(t.id, {
            assigned_user_ids: Array.from(nextUserIds),
            assigned_groups: Array.from(nextGroups)
        });
        count++;
    }

    res.json({ ok: true, count });
}

module.exports = {
    listTasks,
    createTask,
    updateTaskById,
    stopTask,
    removeTask,
    checkUserDependencies,
    reassignUserTasks
};
