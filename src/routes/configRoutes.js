const express = require("express");
const { getPublicConfig, needsSetup, setup, updateSettings, testMail, testExportMail, testAutoExport } = require("../controllers/ConfigController");
const { requireRole } = require("../middleware/auth");
const { upload, configUpload } = require("../middleware/upload");

const router = express.Router();

router.get("/config", getPublicConfig);
router.get("/needs-setup", needsSetup);

router.post(
    "/setup",
    configUpload.fields([{ name: "logo_file", maxCount: 1 }, { name: "favicon_file", maxCount: 1 }]),
    setup
);

router.post(
    "/settings",
    requireRole("admin"),
    configUpload.fields([{ name: "logo_file", maxCount: 1 }, { name: "favicon_file", maxCount: 1 }]),
    updateSettings
);

router.post("/test-mail", requireRole("admin"), testMail);
router.post("/test-export-mail", requireRole("admin"), testExportMail);
router.post("/test-export", requireRole("admin"), testAutoExport);
router.post("/cron-preview", require("../controllers/ConfigController").cronPreview);

module.exports = router;
