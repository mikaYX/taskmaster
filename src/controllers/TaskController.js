const { getTasks, getTaskById, insertTask, updateTask, deleteTaskCascade } = require("../models/Task");
const { getConfig } = require("../models/Config");
const { getTimeZoneForCountry, ymdFromDateInTZ, mondayOfWeek, ymdToString, parseYMD, nowIso } = require("../utils/time");

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

async function listTasks(_req, res) {
    const tasks = await getTasks();
    res.json(tasks);
}

async function createTask(req, res) {
    const cfg = await getConfig();
    const { periodicity, description, procedure_url, start_date, end_date } = req.body || {};

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
        updated_at: nowIso()
    };

    await insertTask(task);
    res.json({ ok: true, id });
}

async function updateTaskById(req, res) {
    const id = parseInt(req.params.id, 10);
    const cur = await getTaskById(id);
    if (!cur) return res.status(404).json({ error: "Not found" });

    const cfg = await getConfig();
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
        active_until: payload.active_until ?? undefined
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

module.exports = {
    listTasks,
    createTask,
    updateTaskById,
    stopTask,
    removeTask
};
