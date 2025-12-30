const { getRoles, createRole, deleteRole } = require("../models/UserRole");

async function listRoles(req, res) {
    try {
        const roles = await getRoles();
        res.json(roles);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch roles" });
    }
}

async function addRole(req, res) {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: "Role name is required" });
        }

        const trimmedName = name.trim();

        // Validate name (alphanumeric, spaces, hyphens, underscores only)
        if (!/^[a-zA-Z0-9 _-]+$/.test(trimmedName)) {
            return res.status(400).json({ error: "Invalid role name. Use only letters, numbers, spaces, hyphens, and underscores." });
        }

        const id = await createRole(trimmedName);
        res.json({ ok: true, id, name: trimmedName });
    } catch (e) {
        if (e.message === 'Role already exists') {
            return res.status(400).json({ error: e.message });
        }
        console.error(e);
        res.status(500).json({ error: "Failed to create role" });
    }
}

async function removeRole(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const success = await deleteRole(id);

        if (!success) {
            return res.status(404).json({ error: "Role not found" });
        }

        res.json({ ok: true });
    } catch (e) {
        if (e.message.includes('Cannot delete')) {
            return res.status(400).json({ error: e.message });
        }
        console.error(e);
        res.status(500).json({ error: "Failed to delete role" });
    }
}

module.exports = {
    listRoles,
    addRole,
    removeRole
};
