const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getDelegationsForTask(taskId) {
    const db = getDb();
    return await db.all(`
        SELECT td.*, u.username as delegate_username, u.fullname as delegate_fullname 
        FROM task_delegations td
        JOIN users u ON td.delegate_user_id = u.id
        WHERE td.task_id = ?
        ORDER BY td.start_date ASC
    `, [taskId]);
}

async function createDelegation(delegation) {
    const db = getDb();
    const { task_id, delegate_user_id, start_date, end_date } = delegation;
    const now = nowIso();
    const result = await db.run(`
        INSERT INTO task_delegations (task_id, delegate_user_id, start_date, end_date, created_at)
        VALUES (?, ?, ?, ?, ?)
    `, [task_id, delegate_user_id, start_date, end_date, now]);
    return result.lastID;
}

async function deleteDelegation(id) {
    const db = getDb();
    const result = await db.run(`DELETE FROM task_delegations WHERE id = ?`, [id]);
    return result.changes > 0;
}

async function getActiveDelegationForTask(taskId, dateYMD) {
    const db = getDb();
    // Check if dateYMD is between start_date and end_date (inclusive)
    // Note: SQLite string comparison works for YYYY-MM-DD
    return await db.get(`
        SELECT td.*, u.username as delegate_username, u.fullname as delegate_fullname 
        FROM task_delegations td
        JOIN users u ON td.delegate_user_id = u.id
        WHERE td.task_id = ? 
          AND ? BETWEEN td.start_date AND td.end_date
        LIMIT 1
    `, [taskId, dateYMD]);
}

module.exports = {
    getDelegationsForTask,
    createDelegation,
    deleteDelegation,
    getActiveDelegationForTask
};
