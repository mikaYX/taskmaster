const { getConfig } = require("../models/Config");
const { getUserByUsername, getUsers, createUser, updateUser, getUserById } = require("../models/User");
const { verifyPassword, signToken, hashPassword } = require("../utils/security");
const { authenticateLdap } = require("../services/LdapService");

async function getSession(req, res) {
    let mustChange = false;
    if (req.auth?.id) {
        const u = await getUserById(req.auth.id);
        if (u && u.auth_provider === 'local' && u.must_change_password) mustChange = true;
    }
    res.json({
        role: req.auth?.role || "guest",
        groups: req.auth?.groups || [],
        id: req.auth?.id,
        name: req.auth?.name,
        mustChangePassword: mustChange
    });
}

async function logout(_req, res) {
    res.json({ ok: true });
}

async function loginUser(req, res) {
    const { username, password } = req.body || {};
    const cfg = await getConfig();

    if (cfg.app_mode === 'team') {
        if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

        // 1. Try Local Auth
        let user = await getUserByUsername(username);
        let authenticated = false;

        if (user && user.auth_provider === 'local' && verifyPassword(password, user.password_hash)) {
            authenticated = true;
        }

        // 2. Try LDAP Auth if enabled and not authenticated locally
        if (!authenticated && cfg.auth_ldap_enabled) {
            const ldapUser = await authenticateLdap(cfg, username, password);
            if (ldapUser) {
                // Sync User
                if (user) {
                    authenticated = true;
                    await updateUser(user.id, {
                        fullname: ldapUser.fullname,
                        email: ldapUser.email,
                    });
                    user = await getUserByUsername(username); // Refresh
                } else {
                    // Deny access if not provisioned manually
                    return res.status(403).json({ error: "Access denied. Account not provisioned." });
                }
            }
        }

        if (!authenticated) {
            return res.status(401).json({ error: "Bad credentials" });
        }

        return res.json({
            token: signToken({ role: user.role, groups: user.groups, id: user.id, name: user.username }),
            mustChangePassword: user.auth_provider === 'local' && !!user.must_change_password
        });
    }

    if (!cfg.user_password_hash) return res.status(400).json({ error: "Setup required" });
    if (!verifyPassword(password || "", cfg.user_password_hash)) {
        return res.status(401).json({ error: "Bad credentials" });
    }
    return res.json({ token: signToken({ role: "user", groups: ["user"] }) });
}

async function loginAdmin(req, res) {
    const { password } = req.body || {};
    const cfg = await getConfig();
    if (!cfg.admin_password_hash) return res.status(400).json({ error: "Setup required" });
    if (!verifyPassword(password || "", cfg.admin_password_hash)) {
        return res.status(401).json({ error: "Bad credentials" });
    }
    return res.json({ token: signToken({ role: "admin", groups: ["admin"] }) });
}

async function getUsersList(req, res) {
    const users = await getUsers();
    res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        fullname: u.fullname || '',
        email: u.email || '',
        role: u.role,
        auth_provider: u.auth_provider,
        groups: u.groups
    })));
}

async function changeMyPassword(req, res) {
    if (!req.auth || !req.auth.id) return res.status(401).json({ error: "Unauthorized" });
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const user = await getUserById(req.auth.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.auth_provider !== 'local') return res.status(400).json({ error: "Cannot change password for external account" });

    await updateUser(user.id, {
        password_hash: hashPassword(password),
        must_change_password: false
    });
    res.json({ ok: true });
}

async function checkUserDependencies(req, res) {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "Missing userId" });

        const { getDb } = require("../config/db");
        const db = getDb();

        // Check task_assignments
        const tasks = await db.all(
            `SELECT DISTINCT t.* FROM tasks t 
             INNER JOIN task_assignments ta ON t.id = ta.task_id 
             WHERE ta.user_id = ?`,
            [userId]
        );

        res.json({ count: tasks.length, tasks });
    } catch (error) {
        console.error('Error checking user dependencies:', error);
        res.status(500).json({ error: "Failed to check dependencies" });
    }
}

async function reassignUser(req, res) {
    try {
        const { oldUserId, newUserId, newGroupId } = req.body;
        if (!oldUserId) return res.status(400).json({ error: "Missing oldUserId" });

        const { getDb } = require("../config/db");
        const db = getDb();

        if (newUserId) {
            // Reassign to another user
            await db.run(
                `UPDATE task_assignments SET user_id = ? WHERE user_id = ?`,
                [newUserId, oldUserId]
            );
        } else if (newGroupId) {
            // Reassign to a group (delete old assignments)
            // In a real implementation, you might want to assign to all users in that group
            await db.run(`DELETE FROM task_assignments WHERE user_id = ?`, [oldUserId]);
        } else {
            // Just remove assignments
            await db.run(`DELETE FROM task_assignments WHERE user_id = ?`, [oldUserId]);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('Error reassigning user:', error);
        res.status(500).json({ error: "Failed to reassign tasks" });
    }
}

async function refreshToken(req, res) {
    try {
        if (!req.auth || !req.auth.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Fetch fresh user data with updated groups
        const user = await getUserById(req.auth.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Generate new token with updated groups
        const newToken = signToken({
            role: user.role,
            groups: user.groups || [],
            id: user.id,
            name: user.username
        });

        res.json({
            token: newToken,
            message: "Token refreshed successfully"
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: "Failed to refresh token" });
    }
}

module.exports = {
    getSession,
    logout,
    loginUser,
    loginAdmin,
    getUsersList,
    changeMyPassword,
    checkUserDependencies,
    reassignUser,
    refreshToken
};
