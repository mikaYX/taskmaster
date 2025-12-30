const { getConfig } = require("../models/Config");
const { setStatus, clearStatus } = require("../models/Status");
const { buildInstances } = require("../services/InstanceService");
const { getTaskById, getTaskAssignments, getTaskGroupAssignments } = require("../models/Task");
const { getActiveDelegationForTask } = require("../models/TaskDelegation");
const { getTimeZoneForCountry, ymdFromDateInTZ, ymdToString } = require("../utils/time");

async function listInstances(req, res) {
    const { from, to, status, search } = req.query || {};
    if (!from || !to) return res.status(400).json({ error: "Missing from/to" });

    const cfg = await getConfig();
    const data = await buildInstances({ from, to, status, search }, cfg.country || "FR");
    res.json(data);
}

async function setInstanceStatus(req, res) {
    const { task_id, start_ts, end_ts, status, comment } = req.body || {};
    if (!task_id || !start_ts || !end_ts || !status) {
        return res.status(400).json({ error: "Missing fields" });
    }

    // Disallow status changes on future instances
    if (Date.parse(start_ts) > Date.now()) {
        return res.status(400).json({ error: "Cannot update future instance" });
    }

    // Authorization Check
    const cfg = await getConfig();
    if (cfg.app_mode === 'team' && req.auth && req.auth.role !== 'admin') {
        const userId = parseInt(req.auth.id, 10);
        const userGroups = req.auth.groups || [];

        // Check Assignments
        const assignedIds = await getTaskAssignments(task_id);
        const assignedGroups = await getTaskGroupAssignments(task_id);

        const isUnassigned = assignedIds.length === 0 && assignedGroups.length === 0;
        const isAssignedToUser = assignedIds.includes(userId);
        const isAssignedToGroup = assignedGroups.some(g => userGroups.includes(g));

        // Check Delegation
        const tz = getTimeZoneForCountry(cfg.country || "FR");
        const dateYMD = ymdToString(ymdFromDateInTZ(new Date(start_ts), tz));
        const delegation = await getActiveDelegationForTask(task_id, dateYMD);
        const isDelegate = delegation && delegation.delegate_user_id === userId;

        let hasRight = false;

        if (delegation) {
            // If delegated, typically ONLY delegate has right (substitute)
            if (isDelegate) hasRight = true;
        } else {
            // Normal assignment
            if (isUnassigned) hasRight = true;
            else if (isAssignedToUser || isAssignedToGroup) hasRight = true;
        }

        if (!hasRight) {
            return res.status(403).json({ error: "Unauthorized: Not assigned or delegated to you." });
        }
    }

    const key = `${task_id}|${start_ts}|${end_ts}`;
    await setStatus(key, status, comment || "", req.auth?.id, req.auth?.name);
    res.json({ ok: true });
}

async function clearInstanceStatus(req, res) {
    const { task_id, start_ts, end_ts } = req.body || {};
    if (!task_id || !start_ts || !end_ts) {
        return res.status(400).json({ error: "Missing fields" });
    }

    const key = `${task_id}|${start_ts}|${end_ts}`;
    await clearStatus(key);
    res.json({ ok: true });
}

module.exports = {
    listInstances,
    setInstanceStatus,
    clearInstanceStatus
};
