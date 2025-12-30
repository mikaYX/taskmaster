const express = require("express");
const { listInstances, setInstanceStatus, clearInstanceStatus } = require("../controllers/InstanceController");
const { exportCsv, exportPdf } = require("../controllers/ExportController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Instances
router.get("/instances", requireRole("guest", "admin", "user"), listInstances);
router.post("/instances/set-status", requireRole("admin", "user"), setInstanceStatus);
router.post("/instances/clear-status", requireRole("admin"), clearInstanceStatus);

// Export (keeping them in instanceRoutes or separating? Server.cjs had them as api/export.csv)
// We can support api/export.csv directly if we bind it in index.js to proper paths.
// But here let's export them too.
// The original paths were /api/export.csv, not /api/instances/export.csv (though it's related).
// We'll put them in a separate router or here. Let's do a separate router file for cleanliness.

module.exports = router;
