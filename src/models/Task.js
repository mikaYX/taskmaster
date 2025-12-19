const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

// Notifs are tied to tasks often, but we can keep them separate or here. 
// Server.cjs had deleteTaskCascade deleting notifs. We'll implement that here.

async function getTasks() {
    const db = getDb();
    return await db.all(`SELECT * FROM tasks ORDER BY id ASC`);
}

async function getTaskById(id) {
    const db = getDb();
    return await db.get(`SELECT * FROM tasks WHERE id=?`, [id]);
}

async function insertTask(t) {
    const db = getDb();
    await db.run(`
    INSERT INTO tasks(id, periodicity, description, procedure_url, start_date, end_date, active_until, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
        t.id, t.periodicity, t.description, t.procedure_url || "",
        t.start_date, t.end_date || "", t.active_until || "",
        t.created_at, t.updated_at
    ]);
}

async function updateTask(id, patch) {
    const db = getDb();
    const cur = await getTaskById(id);
    if (!cur) return false;

    const next = { ...cur };
    for (const [k, v] of Object.entries(patch || {})) {
        if (v !== undefined) next[k] = v;
    }
    next.updated_at = nowIso();

    await db.run(`
    UPDATE tasks
    SET periodicity=?, description=?, procedure_url=?, start_date=?, end_date=?, active_until=?, updated_at=?
    WHERE id=?
  `, [
        next.periodicity,
        next.description,
        next.procedure_url || "",
        next.start_date,
        next.end_date || "",
        next.active_until || "",
        next.updated_at,
        id
    ]);

    return true;
}

async function deleteTaskCascade(id) {
    const db = getDb();
    await db.exec("BEGIN");
    try {
        const like = `${id}|%`;

        // Supprime tous les overrides/historiques liés à cette tâche
        await db.run(`DELETE FROM statuses WHERE k LIKE ?`, [like]);

        // Supprime toutes les notifs liées à cette tâche
        await db.run(`DELETE FROM notif WHERE k LIKE ?`, [like]);

        // Supprime la tâche
        const r = await db.run(`DELETE FROM tasks WHERE id=?`, [id]);

        await db.exec("COMMIT");
        return (r.changes || 0) > 0;
    } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
    }
}

module.exports = {
    getTasks,
    getTaskById,
    insertTask,
    updateTask,
    deleteTaskCascade
};
