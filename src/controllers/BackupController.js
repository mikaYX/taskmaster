const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');

// Helper to get uploads dir
const getUploadsDir = () => path.join(__dirname, '../../client/public/uploads');

// Helper function to create the backup object/buffer (Internal Use for Controller + Scheduler)
// Returns { buffer: Buffer, filename: String, mimetype: String }
async function createBackupInternal({ type, password }) {
    const db = getDb();
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const data = {};

    for (const table of tables) {
        const rows = await db.all(`SELECT * FROM ${table.name}`);
        data[table.name] = rows;
    }

    const backupObj = {
        version: 1,
        created_at: nowIso(),
        data: data
    };

    let finalBuffer;
    let extension;
    let mimetype;

    if (type === 'zip') {
        extension = 'zip';
        mimetype = 'application/zip';

        // Create zip buffer in memory
        const archive = archiver('zip', { zlib: { level: 9 } });
        const buffers = [];
        archive.on('data', data => buffers.push(data));

        const promise = new Promise((resolve, reject) => {
            archive.on('end', () => resolve(Buffer.concat(buffers)));
            archive.on('error', reject);
        });

        // 1. Add backup.json
        let jsonContent = JSON.stringify(backupObj, null, 2);
        // If password provided, DO WE encrypt the inner JSON?
        // User asked: "encrypt with a password the json".
        // Strategy: 
        // - If type=json + password: The file content is the encrypted blob.
        // - If type=zip + password: The `backup.json` INSIDE is encrypted? OR the whole zip is encrypted?
        // Let's encrypt the `backup.json` string inside the zip. This allows zip to be opened but data is safe.
        // AND maybe uploads? User said "encrypt... the json".
        // Let's stick to encrypting the JSON content.

        if (password) {
            jsonContent = encrypt(jsonContent, password);
        }

        archive.append(jsonContent, { name: 'backup.json' });

        // 2. Add uploads
        const uploadsDir = getUploadsDir();
        if (fs.existsSync(uploadsDir)) {
            archive.directory(uploadsDir, 'uploads');
        }

        // 3. Add export_filters (Presets)
        const exportFiltersDir = path.join(process.cwd(), 'data', 'export_filters');
        if (fs.existsSync(exportFiltersDir)) {
            archive.directory(exportFiltersDir, 'data/export_filters');
        }

        await archive.finalize();
        finalBuffer = await promise;

    } else {
        // JSON
        extension = 'json';
        mimetype = 'application/json';
        let jsonContent = JSON.stringify(backupObj, null, 2);

        if (password) {
            jsonContent = encrypt(jsonContent, password);
        }

        finalBuffer = Buffer.from(jsonContent);
    }

    const filename = `taskmaster-backup-${nowIso().replace(/:/g, "-")}.${extension}`;
    return { buffer: finalBuffer, filename, mimetype };
}


async function exportBackup(req, res) {
    try {
        const type = req.query.type || 'json'; // json | zip
        const password = req.query.password || null;

        const { buffer, filename, mimetype } = await createBackupInternal({ type, password });

        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", mimetype);
        res.send(buffer);

    } catch (error) {
        console.error("Backup export error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to create backup" });
        }
    }
}

async function importBackup(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const password = req.body.password || null;

        // Read file content first
        let fileContent = fs.readFileSync(req.file.path);
        let backupData = null;
        let isZip = false;

        // Detection: ZIP magic bytes? PK..
        if (fileContent.length > 4 && fileContent[0] === 0x50 && fileContent[1] === 0x4B && fileContent[2] === 0x03 && fileContent[3] === 0x04) {
            isZip = true;
        }

        // If not zip, check if it's our JSON encrypted or plain
        if (!isZip) {
            const strContent = fileContent.toString('utf8');
            if (isEncrypted(strContent)) {
                if (!password) {
                    return res.status(401).json({ error: "Password required", requiresPassword: true });
                }
                try {
                    const decrypted = decrypt(strContent, password);
                    backupData = JSON.parse(decrypted.toString('utf8'));
                } catch (e) {
                    return res.status(403).json({ error: "Invalid password" });
                }
            } else {
                try {
                    backupData = JSON.parse(strContent);
                } catch (e) {
                    return res.status(400).json({ error: "Invalid JSON format" }); // Could be garbage
                }
            }
        } else {
            // It is a ZIP
            const zip = new AdmZip(req.file.path); // AdmZip can take path
            const zipEntries = zip.getEntries();

            const jsonEntry = zipEntries.find(entry => entry.entryName === "backup.json" || entry.entryName === "taskmaster-backup.json");

            if (!jsonEntry) {
                return res.status(400).json({ error: "No backup.json found in archive" });
            }

            let jsonStr = jsonEntry.getData().toString('utf8');

            // Check if inner JSON is encrypted
            if (isEncrypted(jsonStr)) {
                if (!password) {
                    return res.status(401).json({ error: "Password required", requiresPassword: true });
                }
                try {
                    const decrypted = decrypt(jsonStr, password);
                    backupData = JSON.parse(decrypted.toString('utf8'));
                } catch (e) {
                    return res.status(403).json({ error: "Invalid password" });
                }
            } else {
                backupData = JSON.parse(jsonStr);
            }

            // Extract uploads if present (and if we proceeded safely)
            const uploadsDir = getUploadsDir();
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            // We iterate entries again to extract uploads
            zipEntries.forEach(entry => {
                if (entry.entryName.startsWith('uploads/') && !entry.isDirectory) {
                    const relPath = entry.entryName.substring(8);
                    if (relPath) {
                        const targetPath = path.join(uploadsDir, relPath);
                        const targetDir = path.dirname(targetPath);
                        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                        fs.writeFileSync(targetPath, entry.getData());
                    }
                }
            });
        }

        if (!backupData || !backupData.data) {
            return res.status(400).json({ error: "Invalid backup data structure" });
        }

        // --- Database Restore Logic ---
        const db = getDb();
        await db.exec("BEGIN");

        try {
            await db.exec("PRAGMA foreign_keys = OFF");
            const tables = Object.keys(backupData.data);

            for (const tableName of tables) {
                const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [tableName]);
                if (!tableExists) continue;

                await db.run(`DELETE FROM ${tableName}`);

                const rows = backupData.data[tableName];
                if (rows.length > 0) {
                    const keys = Object.keys(rows[0]);
                    const placeholders = keys.map(() => "?").join(", ");
                    const query = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`;

                    for (const row of rows) {
                        const values = keys.map(k => row[k]);
                        await db.run(query, values);
                    }
                }
            }

            await db.exec("PRAGMA foreign_keys = ON");
            await db.exec("COMMIT");

            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            res.json({ success: true, message: "Backup restored successfully" });

        } catch (dbError) {
            await db.exec("ROLLBACK");
            throw dbError;
        }

    } catch (error) {
        console.error("Backup import error:", error);
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to restore backup: " + error.message });
        }
    }
}

module.exports = {
    exportBackup,
    importBackup,
    createBackupInternal
};
