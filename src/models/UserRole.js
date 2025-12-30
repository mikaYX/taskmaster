const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");

async function getRoles() {
    const db = getDb();
    return await db.all(`SELECT * FROM user_roles ORDER BY is_system DESC, name ASC`);
}

async function getRoleById(id) {
    const db = getDb();
    return await db.get(`SELECT * FROM user_roles WHERE id=?`, [id]);
}

async function getRoleByName(name) {
    const db = getDb();
    return await db.get(`SELECT * FROM user_roles WHERE name=?`, [name]);
}

async function createRole(name) {
    const db = getDb();
    const existing = await getRoleByName(name);
    if (existing) {
        throw new Error('Role already exists');
    }

    const result = await db.run(
        `INSERT INTO user_roles (name, is_system, created_at) VALUES (?, 0, ?)`,
        [name, nowIso()]
    );
    return result.lastID;
}

async function deleteRole(id) {
    const db = getDb();
    const role = await getRoleById(id);

    if (!role) {
        return false;
    }

    if (role.is_system) {
        throw new Error('Cannot delete system roles');
    }

    // Check if any users have this role
    // Check if any users have this role (legacy or groups)
    const usersWithRole = await db.all(`
        SELECT id FROM users WHERE role=?
        UNION
        SELECT user_id as id FROM user_group_memberships WHERE role_name=?
    `, [role.name, role.name]);
    if (usersWithRole.length > 0) {
        throw new Error('Cannot delete role that is assigned to users');
    }

    const result = await db.run(`DELETE FROM user_roles WHERE id=?`, [id]);
    return (result.changes || 0) > 0;
}

module.exports = {
    getRoles,
    getRoleById,
    getRoleByName,
    createRole,
    deleteRole
};
