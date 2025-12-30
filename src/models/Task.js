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
    INSERT INTO tasks(id, periodicity, description, procedure_url, start_date, end_date, active_until, created_at, updated_at, assigned_user_id, assigned_group, skip_weekends, skip_holidays, hno_group_id)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
        t.id, t.periodicity, t.description, t.procedure_url || "",
        t.start_date, t.end_date || "", t.active_until || "",
        t.created_at, t.updated_at, t.assigned_user_id || null,
        t.assigned_group || null,
        t.skip_weekends || 0,
        t.skip_holidays || 0,
        t.hno_group_id || null
    ]);

    // Gestion des assignations multiples
    if (t.assigned_user_ids && Array.isArray(t.assigned_user_ids)) {
        await setTaskAssignments(t.id, t.assigned_user_ids);
    }
    // Gestion des groupes multiples
    if (t.assigned_groups && Array.isArray(t.assigned_groups)) {
        await setTaskGroupAssignments(t.id, t.assigned_groups);
    }
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
    SET periodicity=?, description=?, procedure_url=?, start_date=?, end_date=?, active_until=?, updated_at=?, assigned_user_id=?, assigned_group=?, skip_weekends=?, skip_holidays=?, hno_group_id=?
    WHERE id=?
  `, [
        next.periodicity,
        next.description,
        next.procedure_url || "",
        next.start_date,
        next.end_date || "",
        next.active_until || "",
        next.updated_at,
        next.assigned_user_id !== undefined ? next.assigned_user_id : (cur.assigned_user_id || null),
        next.assigned_group !== undefined ? next.assigned_group : (cur.assigned_group || null),
        next.skip_weekends !== undefined ? next.skip_weekends : (cur.skip_weekends || 0),
        next.skip_holidays !== undefined ? next.skip_holidays : (cur.skip_holidays || 0),
        next.hno_group_id !== undefined ? next.hno_group_id : (cur.hno_group_id || null),
        id
    ]);

    // Gestion des assignations multiples si fourni
    if (patch.assigned_user_ids !== undefined) {
        await setTaskAssignments(id, patch.assigned_user_ids || []);
    }
    // Gestion des groupes multiples si fourni
    if (patch.assigned_groups !== undefined) {
        await setTaskGroupAssignments(id, patch.assigned_groups || []);
    }

    return true;
}

async function deleteTaskCascade(id) {
    const db = getDb();
    await db.exec("BEGIN");
    try {
        const like = `${id}|%`;

        // Supprime les assignations
        await db.run(`DELETE FROM task_assignments WHERE task_id=?`, [id]);
        await db.run(`DELETE FROM task_group_assignments WHERE task_id=?`, [id]);

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

// Fonctions pour gérer les assignations multiples
async function setTaskAssignments(taskId, userIds) {
    const db = getDb();
    // Supprimer les anciennes assignations
    await db.run(`DELETE FROM task_assignments WHERE task_id=?`, [taskId]);

    // Ajouter les nouvelles assignations
    if (userIds && userIds.length > 0) {
        const now = nowIso();
        for (const userId of userIds) {
            await db.run(
                `INSERT INTO task_assignments(task_id, user_id, created_at) VALUES(?, ?, ?)`,
                [taskId, userId, now]
            );
        }
    }
}

async function getTaskAssignments(taskId) {
    const db = getDb();
    const rows = await db.all(
        `SELECT user_id FROM task_assignments WHERE task_id=?`,
        [taskId]
    );
    return rows.map(r => r.user_id);
}

async function setTaskGroupAssignments(taskId, groupNames) {
    const db = getDb();
    await db.run(`DELETE FROM task_group_assignments WHERE task_id=?`, [taskId]);

    if (groupNames && groupNames.length > 0) {
        const now = nowIso();
        for (const name of groupNames) {
            await db.run(
                `INSERT INTO task_group_assignments(task_id, group_name, created_at) VALUES(?, ?, ?)`,
                [taskId, name, now]
            );
        }
    }
}

async function getTaskGroupAssignments(taskId) {
    const db = getDb();
    const rows = await db.all(
        `SELECT group_name FROM task_group_assignments WHERE task_id=?`,
        [taskId]
    );
    return rows.map(r => r.group_name);
}

async function getTasksWithAssignments() {
    const tasks = await getTasks();
    for (const task of tasks) {
        task.assigned_user_ids = await getTaskAssignments(task.id);
        task.assigned_groups = await getTaskGroupAssignments(task.id);
    }
    return tasks;
}

module.exports = {
    getTasks,
    getTaskById,
    insertTask,
    updateTask,
    deleteTaskCascade,
    setTaskAssignments,
    getTaskAssignments,
    setTaskGroupAssignments,
    getTaskGroupAssignments,
    getTasksWithAssignments
};
