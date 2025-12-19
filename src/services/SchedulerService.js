const cron = require("node-cron");
const { getConfig } = require("../models/Config");
const { getTimeZoneForCountry } = require("../utils/time");
const { auditMissedInstances } = require("./InstanceService");
const { runAutoExportOnce, cleanupOldExports } = require("./ExportService");

let jobs = { audit: null, autoExport: null, cleanup: null };

async function reloadSchedulers() {
    const cfg = await getConfig();
    const tz = getTimeZoneForCountry(cfg.country || "FR");

    if (jobs.audit) jobs.audit.stop();
    if (jobs.autoExport) jobs.autoExport.stop();

    // Audit : tous les 15 min
    jobs.audit = cron.schedule("*/15 * * * *", async () => {
        try { await auditMissedInstances({ lookbackDays: 60 }, cfg.country || "FR"); }
        catch (e) { console.error("audit job:", e); }
    }, { timezone: tz });

    // Auto-export
    if (cfg.auto_export_enabled && cfg.auto_export_cron) {
        jobs.autoExport = cron.schedule(cfg.auto_export_cron, async () => {
            try { await runAutoExportOnce(); }
            catch (e) { console.error("autoExport job:", e); }
        }, { timezone: tz });
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
}

module.exports = {
    reloadSchedulers
};
