const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getAllHnoGroups() {
    const db = getDb();
    return await db.all("SELECT * FROM hno_groups ORDER BY id ASC");
}

async function getHnoGroupById(id) {
    const db = getDb();
    return await db.get("SELECT * FROM hno_groups WHERE id=?", [id]);
}

async function createHnoGroup(data) {
    const db = getDb();
    const now = nowIso();
    const result = await db.run(`
        INSERT INTO hno_groups (name, days, start_time, end_time, created_at)
        VALUES (?, ?, ?, ?, ?)
    `, [data.name, data.days, data.start_time, data.end_time, now]);
    return result.lastID;
}

async function updateHnoGroup(id, data) {
    const db = getDb();
    await db.run(`
        UPDATE hno_groups SET name=?, days=?, start_time=?, end_time=?
        WHERE id=?
    `, [data.name, data.days, data.start_time, data.end_time, id]);
    return true;
}

async function deleteHnoGroup(id) {
    const db = getDb();
    await db.run("DELETE FROM hno_groups WHERE id=?", [id]);
    // Optionally: Set hno_group_id to null for tasks using this?
    // For now, let's keep it simple. Or clean up tasks.
    await db.run("UPDATE tasks SET hno_group_id=NULL WHERE hno_group_id=?", [id]);
    return true;
}

module.exports = {
    getAllHnoGroups,
    getHnoGroupById,
    createHnoGroup,
    updateHnoGroup,
    deleteHnoGroup
};
