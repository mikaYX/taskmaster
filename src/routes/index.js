const express = require("express");
const authRoutes = require("./authRoutes");
const configRoutes = require("./configRoutes");
const taskRoutes = require("./taskRoutes");
const instanceRoutes = require("./instanceRoutes");
const exportRoutes = require("./exportRoutes");
const { authOptional } = require("../middleware/auth");

const router = express.Router();

// Global middleware for API
router.use(authOptional);

// Mount routes
// Note: The order matters if there are overlapping paths, but here they are distinct or handled by controllers.
// Auth: /api/session, /login-user, etc.
router.use(authRoutes);
router.use(configRoutes);
router.use(taskRoutes);
router.use(instanceRoutes);
router.use(exportRoutes);
router.use("/upload", require("./uploadRoutes"));

module.exports = router;
