const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getStatuses() {
    const db = getDb();
    const rows = await db.all(`SELECT * FROM statuses`);
    const map = {};
    for (const r of rows) {
        map[r.k] = {
            status: r.status,
            comment: r.comment,
            updated_at: r.updated_at,
            updated_by_user_id: r.updated_by_user_id,
            updated_by_username: r.updated_by_username
        };
    }
    return map;
}

async function setStatus(key, status, comment, userId, username) {
    const db = getDb();
    await db.run(`
    INSERT OR REPLACE INTO statuses(k, status, comment, updated_at, updated_by_user_id, updated_by_username)
    VALUES(?, ?, ?, ?, ?, ?)
  `, [key, status, comment || "", nowIso(), userId || null, username || null]);
}

async function clearStatus(key) {
    const db = getDb();
    await db.run(`DELETE FROM statuses WHERE k=?`, [key]);
}

// Notifications (used for scheduling/mail logic mainly)
async function notifExists(key) {
    const db = getDb();
    const row = await db.get(`SELECT k FROM notif WHERE k=?`, [key]);
    return !!row;
}
async function notifPut(key, kind) {
    const db = getDb();
    await db.run(`INSERT OR REPLACE INTO notif(k, kind, sent_at) VALUES(?, ?, ?)`, [key, kind, nowIso()]);
}


module.exports = {
    getStatuses,
    setStatus,
    clearStatus,
    notifExists,
    notifPut
};
