const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { safeFilename } = require("../utils/security");

const router = express.Router();

const PROCEDURE_DIR = path.join(process.cwd(), "client", "public", "uploads", "procedures");
if (!fs.existsSync(PROCEDURE_DIR)) fs.mkdirSync(PROCEDURE_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PROCEDURE_DIR),
    filename: (_req, file, cb) => cb(null, safeFilename(file.originalname))
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB for docs
});

router.post("/", (req, res) => {
    const uploadSingle = upload.single("file");

    uploadSingle(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: "Upload error: " + err.message });
        } else if (err) {
            return res.status(400).json({ error: "Upload error: " + err.message });
        }

        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const url = "/uploads/procedures/" + req.file.filename;
        res.json({ url });
    });
});

module.exports = router;
