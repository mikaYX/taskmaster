const express = require("express");
const { exportBackup, importBackup } = require("../controllers/BackupController");
const { requireRole } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure temp dir exists
const tempDir = path.join(__dirname, '../../data/temp_backups');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

const router = express.Router();

router.get("/backup/export", requireRole("admin"), exportBackup);
router.post("/backup/import", requireRole("admin"), upload.single('backup'), importBackup);

module.exports = router;
