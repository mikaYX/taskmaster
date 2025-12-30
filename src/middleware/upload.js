const path = require("path");
const multer = require("multer");
const { safeFilename } = require("../utils/security");

const UPLOAD_DIR = path.join(process.cwd(), "client", "public", "uploads", "logos");

// Ensure upload dir exists
const fs = require("fs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => cb(null, safeFilename(file.originalname))
    }),
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const configUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (file.fieldname === "logo_file") return cb(null, "logo" + ext);
            if (file.fieldname === "favicon_file") return cb(null, "favicon" + ext);
            return cb(null, safeFilename(file.originalname));
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 }
});

module.exports = {
    upload,
    configUpload,
    UPLOAD_DIR
};
