const express = require("express");
const { exportCsv, exportPdf } = require("../controllers/ExportController");
const { listPresets, savePreset, deletePreset } = require("../controllers/ExportFilterController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/export.csv", requireRole("admin", "user"), exportCsv);
router.get("/export.pdf", requireRole("admin", "user"), exportPdf);

// Custom Export Filters (Presets)
router.get("/export-filters", requireRole("admin"), listPresets);
router.post("/export-filters", requireRole("admin"), savePreset);
router.delete("/export-filters/:name", requireRole("admin"), deletePreset);

module.exports = router;
