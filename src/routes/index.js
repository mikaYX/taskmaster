const express = require("express");
const authRoutes = require("./authRoutes");
const configRoutes = require("./configRoutes");
const taskRoutes = require("./taskRoutes");
const instanceRoutes = require("./instanceRoutes");
const exportRoutes = require("./exportRoutes");
const backupRoutes = require("./backupRoutes");
const userRoleRoutes = require("./userRoleRoutes");
const uploadRoutes = require("./uploadRoutes");
const hnoRoutes = require("./hnoRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const { authOptional } = require("../middleware/auth");

const router = express.Router();

// Global middleware for API
router.use(authOptional);

// Mount routes
// Note: The order matters if there are overlapping paths, but here they are distinct or handled by controllers.
// Auth: /api/session, /login-user, etc.
router.use(authRoutes);
router.use(userRoleRoutes);
router.use(taskRoutes);
router.use(instanceRoutes); // Includes export for now or linked
router.use(exportRoutes);
router.use(backupRoutes);
router.use(configRoutes);
router.use(uploadRoutes);
router.use(hnoRoutes);
router.use(dashboardRoutes);

module.exports = router;
