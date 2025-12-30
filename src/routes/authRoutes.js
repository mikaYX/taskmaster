const express = require("express");
const { getSession, logout, loginUser, loginAdmin, getUsersList, changeMyPassword, checkUserDependencies, reassignUser, refreshToken } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { signToken } = require('../utils/security');
const { getAuthUrl, handleCallback } = require('../services/AzureAuthService');

const router = express.Router();

router.get("/session", getSession);
router.post("/logout", logout);
router.post("/login-user", loginUser);
router.post("/login-admin", loginAdmin);
router.get("/users", getUsersList);
router.post("/change-password", requireAuth, changeMyPassword);
router.post("/check-user-dependencies", requireAuth, checkUserDependencies);
router.post("/reassign-user", requireAuth, reassignUser);
router.post("/refresh-token", requireAuth, refreshToken);

// Azure AD Routes
router.get('/auth/azure', async (req, res) => {
    try {
        console.log("Starting Azure Auth (MSAL)...");
        const url = await getAuthUrl();
        res.redirect(url);
    } catch (e) {
        console.error("Azure Auth Start Error:", e);
        res.status(500).json({ error: "Failed to start Azure authentication: " + e.message });
    }
});

// Handle both GET and POST callbacks
router.all('/auth/azure/callback', async (req, res) => {
    try {
        const code = req.query.code || req.body.code;
        if (req.query.error) {
            throw new Error(`Azure Error: ${req.query.error_description || req.query.error}`);
        }

        if (!code) {
            // If no code and no error, maybe it's just a direct access?
            throw new Error("No authorization code received from Azure.");
        }

        const user = await handleCallback(code);

        // Success - Generate Token
        // Assuming signToken is synchronous
        const token = signToken({ role: user.role, groups: user.groups, id: user.id, name: user.username });

        // Redirect to frontend (port 3000 static or 5173 dev)
        // Using relative path works for static, but for dev we might need absolute if ports differ.
        // Assuming npm run build was run, '/' is fine.
        res.redirect(`/?token=${token}`);

    } catch (e) {
        console.error("Azure Auth Callback Error:", e);
        // Redirect to frontend with error message
        const message = "Authentication failed: " + (e.message || "Unknown error");
        res.redirect(`/?error=${encodeURIComponent(message)}`);
    }
});

module.exports = router;
