const express = require("express");
const { exportCsv, exportPdf } = require("../controllers/ExportController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/export.csv", requireRole("admin", "user"), exportCsv);
router.get("/export.pdf", requireRole("admin", "user"), exportPdf);

module.exports = router;
