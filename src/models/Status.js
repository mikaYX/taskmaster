const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getStatuses() {
    const db = getDb();
    const rows = await db.all(`SELECT * FROM statuses`);
    const map = {};
    for (const r of rows) {
        map[r.k] = { status: r.status, comment: r.comment, updated_at: r.updated_at };
    }
    return map;
}

async function setStatus(key, status, comment) {
    const db = getDb();
    await db.run(`
    INSERT OR REPLACE INTO statuses(k, status, comment, updated_at)
    VALUES(?, ?, ?, ?)
  `, [key, status, comment || "", nowIso()]);
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
