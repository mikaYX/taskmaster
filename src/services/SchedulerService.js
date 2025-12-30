const cron = require("node-cron");
const { getConfig } = require("../models/Config");
const { getTimeZoneForCountry } = require("../utils/time");
const { auditMissedInstances, buildInstances } = require("./InstanceService");
const { runAutoExportOnce, cleanupOldExports } = require("./ExportService");
const { sendMissingTasksEmail, sendReminderEmail } = require("./EmailService");
const { reloadBackupScheduler } = require("./BackupScheduler");
const { notifExists, notifPut } = require("../models/Status");

let jobs = { audit: null, autoExport: null, cleanup: null, reminder: null };
let lastMissingCheck = {};

async function reloadSchedulers() {
    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");

    if (jobs.audit) jobs.audit.stop();
    if (jobs.autoExport) jobs.autoExport.stop();
    if (jobs.reminder) jobs.reminder.stop();

    // Audit : tous les 15 min (avec envoi d'emails pour missing tasks)
    jobs.audit = cron.schedule("*/15 * * * *", async () => {
        try {
            await auditMissedInstances({ lookbackDays: 60 }, cfg.country || "FR");

            // Send missing tasks email if enabled
            const freshCfg = await getConfig();
            if (freshCfg.mail_enabled && freshCfg.mail_missing_enabled) {
                const now = new Date();
                const todayKey = now.toISOString().split('T')[0];

                // Get today's instances to check for missing tasks
                const instances = await buildInstances({
                    from: todayKey,
                    to: todayKey,
                    status: 'missing'
                }, freshCfg.country || "FR");

                if (instances.length > 0) {
                    // Check if we already sent email for these tasks today
                    const notifKey = `missing_email_${todayKey}`;
                    const alreadySent = await notifExists(notifKey);

                    if (!alreadySent) {
                        const result = await sendMissingTasksEmail(instances);
                        if (result.ok) {
                            await notifPut(notifKey, 'missing_email');
                            console.log(`Missing tasks email sent: ${result.count} tasks to ${result.recipients} recipients`);
                        }
                    }
                }
            }
        }
        catch (e) { console.error("audit job:", e); }
    }, { timezone: tz });

    // Reminder: every 10 min (check for tasks starting in 1 hour)
    if (cfg.mail_enabled && cfg.mail_reminder_enabled) {
        jobs.reminder = cron.schedule("*/10 * * * *", async () => {
            try {
                const freshCfg = await getConfig();
                const now = new Date();
                const nowMs = now.getTime();
                // Calculate offset from config (default 1 hour)
                const offsetHours = (typeof freshCfg.mail_reminder_offset_hours !== 'undefined') ? freshCfg.mail_reminder_offset_hours : 1;
                const offsetMinutes = (typeof freshCfg.mail_reminder_offset_minutes !== 'undefined') ? freshCfg.mail_reminder_offset_minutes : 0;
                const offsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;

                // Fallback if 0 to avoid immediate spam or errors, keep 1h? Or let user choose 0?
                // Let's assume minimum 10 min if totally 0 to avoid errors, or just 0 is "at absolute end"?
                // If 0, then we remind WHEN it ends. But the check is every 10 min.
                // Safest is to default to 1h if both are 0, or allow it.
                // Let's use computed offsetMs.

                const margin = 15 * 60 * 1000; // 15 min margin

                // Get instances for today
                const todayKey = now.toISOString().split('T')[0];
                const instances = await buildInstances({
                    from: todayKey,
                    to: todayKey,
                    includeFuture: true
                }, freshCfg.country || "FR");

                for (const task of instances) {
                    // Check status: only remind if pending
                    if (task.status && task.status !== 'pending') continue;

                    const endMs = new Date(task.end_ts).getTime();
                    const timeDiff = endMs - nowMs;

                    // Check if task ends in approximately [offset] (±15 min)
                    if (timeDiff > (offsetMs - margin) && timeDiff < (offsetMs + margin)) {
                        const notifKey = `reminder_${task.task_id}_${task.start_ts}`;
                        const alreadySent = await notifExists(notifKey);

                        if (!alreadySent) {
                            const result = await sendReminderEmail(task);
                            if (result.ok) {
                                await notifPut(notifKey, 'reminder');
                                console.log(`Reminder sent for task: ${task.description}`);
                            }
                        }
                    }
                }
            }
            catch (e) { console.error("reminder job:", e); }
        }, { timezone: tz });
    }

    // Auto-export
    if (cfg.auto_export_enabled && cfg.auto_export_cron) {
        if (cron.validate(cfg.auto_export_cron)) {
            jobs.autoExport = cron.schedule(cfg.auto_export_cron, async () => {
                try { await runAutoExportOnce(); }
                catch (e) { console.error("autoExport job:", e); }
            }, { timezone: tz });
        } else {
            console.error("Invalid cron expression for auto-export:", cfg.auto_export_cron);
        }
    }

    // Cleanup: daily at 03:00
    if (jobs.cleanup) jobs.cleanup.stop();
    jobs.cleanup = cron.schedule("0 3 * * *", async () => {
        try {
            // Re-fetch config to get latest retention
            const freshCfg = await getConfig();
            if (freshCfg.export_retention_days > 0) {
                await cleanupOldExports(freshCfg.export_retention_days);
            }
        } catch (e) { console.error("cleanup job:", e); }
    }, { timezone: tz });

    // Backup Scheduler
    await reloadBackupScheduler();
}

module.exports = {
    reloadSchedulers
};
