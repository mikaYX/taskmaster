const cron = require('node-cron');
const { getConfig } = require('../models/Config');
const { createBackupInternal } = require('../controllers/BackupController');
const fs = require('fs');
const path = require('path');

let backupTask = null;

async function reloadBackupScheduler() {
    if (backupTask) {
        backupTask.stop();
        backupTask = null;
    }

    try {
        // Load settings related to auto backup
        const settings = await getConfig();

        if (!settings || !settings.auto_backup_enabled) {
            console.log("Auto-backup disabled or not configured.");
            return;
        }

        const cronExp = settings.auto_backup_cron; // e.g. "0 2 * * *"
        const backupType = settings.auto_backup_type || 'json'; // 'json' or 'zip'
        const password = settings.auto_backup_password || null;

        if (!cron.validate(cronExp)) {
            console.error("Invalid cron expression for auto-backup:", cronExp);
            return;
        }

        console.log(`Scheduling auto-backup: ${cronExp} (Type: ${backupType})`);

        backupTask = cron.schedule(cronExp, async () => {
            console.log("Running auto-backup task...");
            try {
                // Generate backup
                const result = await createBackupInternal({ type: backupType, password });

                // User requested separating backups to a fixed "./backup" folder.
                let backupDir = path.join(process.cwd(), 'backup');

                // Ensure directory exists
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }

                const filePath = path.join(backupDir, result.filename);
                fs.writeFileSync(filePath, result.buffer);
                console.log("Auto-backup saved to:", filePath);

                // Retention Cleanup (by count)
                const keepCount = parseInt(settings.auto_backup_retention_count, 10) || 3;
                if (keepCount > 0) {
                    await cleanupOldBackups(backupDir, keepCount);
                }

            } catch (err) {
                console.error("Auto-backup execution failed:", err);
            }
        });

    } catch (error) {
        console.error("Error reloading backup scheduler:", error);
    }
}

async function cleanupOldBackups(exportDir, maxCount) {
    try {
        const files = fs.readdirSync(exportDir);

        // Filter and sort backups by modification time (newest first)
        const backups = files
            .filter(f => f.startsWith('taskmaster-backup-'))
            .map(f => {
                try {
                    const stat = fs.statSync(path.join(exportDir, f));
                    return { name: f, time: stat.mtimeMs };
                } catch (e) {
                    return { name: f, time: 0 };
                }
            })
            .sort((a, b) => b.time - a.time);

        if (backups.length > maxCount) {
            const toDelete = backups.slice(maxCount);
            for (const f of toDelete) {
                console.log(`Cleanup Backup: Deleting ${f.name} (exceeds count limit of ${maxCount})`);
                fs.unlinkSync(path.join(exportDir, f.name));
            }
        }
    } catch (e) {
        console.error("Backup cleanup error:", e);
    }
}

module.exports = {
    reloadBackupScheduler,
    cleanupOldBackups
};
