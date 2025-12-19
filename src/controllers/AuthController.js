const { getConfig } = require("../models/Config");
const { verifyPassword, signToken } = require("../utils/security");

async function getSession(req, res) {
    res.json({ role: req.auth?.role || "guest" });
}

async function logout(_req, res) {
    res.json({ ok: true });
}

async function loginUser(req, res) {
    const { password } = req.body || {};
    const cfg = await getConfig();
    if (!cfg.user_password_hash) return res.status(400).json({ error: "Setup required" });
    if (!verifyPassword(password || "", cfg.user_password_hash)) {
        return res.status(401).json({ error: "Bad credentials" });
    }
    return res.json({ token: signToken({ role: "user" }) });
}

async function loginAdmin(req, res) {
    const { password } = req.body || {};
    const cfg = await getConfig();
    if (!cfg.admin_password_hash) return res.status(400).json({ error: "Setup required" });
    if (!verifyPassword(password || "", cfg.admin_password_hash)) {
        return res.status(401).json({ error: "Bad credentials" });
    }
    return res.json({ token: signToken({ role: "admin" }) });
}

module.exports = {
    getSession,
    logout,
    loginUser,
    loginAdmin
};
