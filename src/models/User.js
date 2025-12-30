const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getUsers(opts = {}) {
    const db = getDb();
    const includeDeleted = opts.includeDeleted === true;

    // We filter in SQL if possible, or fetch all and filter?
    // SQL is better.
    let whereClause = "";
    if (!includeDeleted) {
        whereClause = "WHERE u.deleted_at IS NULL";
    }

    const rows = await db.all(`
        SELECT u.id, u.username, u.fullname, u.email, u.role, u.auth_provider, u.must_change_password, u.created_at, u.deleted_at, GROUP_CONCAT(ugm.role_name) as groups_str 
        FROM users u 
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id 
        ${whereClause}
        GROUP BY u.id 
        ORDER BY u.username ASC
    `);

    return rows.map(r => ({
        ...r,
        groups: r.groups_str ? r.groups_str.split(',') : []
    }));
}

async function getUserById(id) {
    const db = getDb();
    const row = await db.get(`
        SELECT u.id, u.username, u.fullname, u.email, u.role, u.auth_provider, u.must_change_password, u.created_at, u.deleted_at, GROUP_CONCAT(ugm.role_name) as groups_str 
        FROM users u 
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id 
        WHERE u.id=? AND u.deleted_at IS NULL
        GROUP BY u.id
    `, [id]);
    if (!row) return null;
    return {
        ...row,
        groups: row.groups_str ? row.groups_str.split(',') : []
    };
}

async function getUserByUsername(username) {
    const db = getDb();
    // Include password_hash for auth check
    const row = await db.get(`
        SELECT u.*, GROUP_CONCAT(ugm.role_name) as groups_str 
        FROM users u 
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id 
        WHERE u.username=? AND u.deleted_at IS NULL
        GROUP BY u.id
    `, [username]);
    if (!row) return null;
    return {
        ...row,
        groups: row.groups_str ? row.groups_str.split(',') : []
    };
}

async function getUserByEmail(email) {
    const db = getDb();
    const row = await db.get(`
        SELECT u.*, GROUP_CONCAT(ugm.role_name) as groups_str 
        FROM users u 
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id 
        WHERE LOWER(u.email)=LOWER(?) AND u.deleted_at IS NULL
        GROUP BY u.id
    `, [email]);
    if (!row) return null;
    return {
        ...row,
        groups: row.groups_str ? row.groups_str.split(',') : []
    };
}

async function getUserByExternalId(extId) {
    const db = getDb();
    const row = await db.get(`
        SELECT u.*, GROUP_CONCAT(ugm.role_name) as groups_str 
        FROM users u 
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id 
        WHERE u.external_id=? AND u.deleted_at IS NULL
        GROUP BY u.id
    `, [extId]);
    if (!row) return null;
    return {
        ...row,
        groups: row.groups_str ? row.groups_str.split(',') : []
    };
}

async function createUser(u) {
    const db = getDb();

    const res = await db.run(`
    INSERT INTO users(username, fullname, email, password_hash, role, created_at, auth_provider, external_id, must_change_password)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [u.username, u.fullname || "", u.email || "", u.password_hash || "", u.role, nowIso(), u.auth_provider || 'local', u.external_id || null, u.must_change_password ? 1 : 0]);

    if (u.groups && Array.isArray(u.groups)) {
        for (const g of u.groups) {
            await db.run(`INSERT OR IGNORE INTO user_group_memberships(user_id, role_name) VALUES(?, ?)`, [res.lastID, g]);
        }
    }
    return res.lastID;
}

async function updateUser(id, patch) {
    const db = getDb();
    // Assuming patch contains what we want to change
    const sets = [];
    const args = [];
    if (patch.username) { sets.push("username=?"); args.push(patch.username); }
    if (patch.fullname !== undefined) { sets.push("fullname=?"); args.push(patch.fullname); }
    if (patch.email !== undefined) { sets.push("email=?"); args.push(patch.email); }
    if (patch.password_hash) { sets.push("password_hash=?"); args.push(patch.password_hash); }
    if (patch.role) { sets.push("role=?"); args.push(patch.role); }
    if (patch.auth_provider) { sets.push("auth_provider=?"); args.push(patch.auth_provider); }
    if (patch.external_id !== undefined) { sets.push("external_id=?"); args.push(patch.external_id); }
    if (patch.must_change_password !== undefined) { sets.push("must_change_password=?"); args.push(patch.must_change_password ? 1 : 0); }

    // We should not allow updating a deleted user

    if (sets.length > 0) {
        args.push(id);
        await db.run(`UPDATE users SET ${sets.join(", ")} WHERE id=? AND deleted_at IS NULL`, args);
    }

    if (patch.groups && Array.isArray(patch.groups)) {
        await db.run(`DELETE FROM user_group_memberships WHERE user_id=?`, [id]);
        for (const g of patch.groups) {
            await db.run(`INSERT INTO user_group_memberships(user_id, role_name) VALUES(?, ?)`, [id, g]);
        }
    }

    return true;
}

async function deleteUser(id) {
    const db = getDb();
    // Soft delete: set deleted_at and rename username to free it up
    const ts = Date.now();
    await db.run(`
        UPDATE users 
        SET deleted_at = ?, username = username || '_del_' || ? 
        WHERE id = ? AND deleted_at IS NULL
    `, [nowIso(), ts, id]);
}

async function getGenericUserById(id) {
    // Helper for when we just want the name regardless of deleted status
    const db = getDb();
    const row = await db.get(`SELECT username FROM users WHERE id=?`, [id]);
    return row;
}

module.exports = {
    getUsers,
    getUserById,
    getUserByUsername,
    createUser,
    updateUser,
    deleteUser,
    getGenericUserById,
    getUserByExternalId,
    getUserByEmail
};
