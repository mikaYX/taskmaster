const { getDelegationsForTask, createDelegation, deleteDelegation } = require("../models/TaskDelegation");
const { getTaskById } = require("../models/Task");
const { parseYMD, ymdToString, compareYMD } = require("../utils/time");

async function listTaskDelegations(req, res) {
    const taskId = parseInt(req.params.id, 10);
    const delegations = await getDelegationsForTask(taskId);
    res.json(delegations);
}

async function addDelegation(req, res) {
    const taskId = parseInt(req.params.id, 10);
    const { delegate_user_id, start_date, end_date } = req.body || {};

    if (delegate_user_id === undefined || !start_date || !end_date) {
        return res.status(400).json({ error: `Missing fields. Got: ${JSON.stringify(req.body)}` });
    }

    // Validate dates
    const s = parseYMD(start_date);
    const e = parseYMD(end_date);
    if (!s || !e) return res.status(400).json({ error: "Invalid dates" });

    // Check start <= end
    if (compareYMD(s, e) > 0) return res.status(400).json({ error: "Start date must be before end date" });

    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const id = await createDelegation({
        task_id: taskId,
        delegate_user_id,
        start_date: ymdToString(s),
        end_date: ymdToString(e)
    });

    res.json({ ok: true, id });
}

async function removeDelegation(req, res) {
    const id = parseInt(req.params.id, 10);
    const ok = await deleteDelegation(id);
    if (!ok) return res.status(404).json({ error: "Delegation not found" });
    res.json({ ok: true });
}

module.exports = {
    listTaskDelegations,
    addDelegation,
    removeDelegation
};
