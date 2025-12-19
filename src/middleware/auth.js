const { verifyToken } = require("../utils/security");

function getBearerToken(req) {
    const h = req.headers.authorization || "";
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m ? m[1].trim() : "";
}

function authOptional(req, _res, next) {
    const tok = getBearerToken(req);
    const payload = tok ? verifyToken(tok) : null;

    // Pas de token (ou token invalide/expiré) => guest
    req.auth = payload || { role: "guest" };

    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        const role = req.auth?.role || "guest";
        if (!roles.includes(role)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
}

module.exports = {
    authOptional,
    requireRole
};
