const { getConfig } = require("../models/Config");
const { setStatus, clearStatus } = require("../models/Status");
const { buildInstances } = require("../services/InstanceService");

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

    const key = `${task_id}|${start_ts}|${end_ts}`;
    await setStatus(key, status, comment || "");
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
