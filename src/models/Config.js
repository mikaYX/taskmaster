const { getDb } = require("../config/db");
const { nowIso } = require("../utils/time");
const { encrypt, decrypt } = require("../utils/security");

async function getConfig() {
    const def = {
        title: "Taskmaster",
        subtitle: "",
        logo_url: "",
        favicon_url: "",
        lang: "EN",
        country: "FR",
        theme: "blue",
        display_mode: "system", // light, dark, system
        app_mode: "team", // Always team now (was solo/team)

        // Mail
        mail_enabled: false,
        smtp_host: "",
        smtp_port: "587",
        smtp_secure: false,
        smtp_user: "",
        smtp_pass: "",
        mail_from: "",
        mail_to: "",
        mail_missing_enabled: true,
        mail_export_enabled: false,
        mail_export_format_csv: true,
        mail_export_format_pdf: true,
        mail_export_recipients: ["admin"],

        // Auto export
        auto_export_enabled: false,
        auto_export_cron: "",
        auto_export_mode: "day",
        auto_export_from_offset_days: 0,
        auto_export_to_offset_days: 0,
        export_retention_days: 0,
        export_dir: "./exports",
        export_format_csv: true,
        export_format_pdf: true,

        // Auto Backup
        auto_backup_enabled: false,
        auto_backup_cron: "0 2 * * *",
        auto_backup_type: "json",
        auto_backup_password: "",
        auto_backup_retention_count: 3,

        // Password hashes
        admin_password_hash: "",
        user_password_hash: "",

        created_at: nowIso(),
        updated_at: nowIso()
    };

    const db = getDb();
    const rows = await db.all(`SELECT k, v FROM config`);

    // Merge DB rows into defaults
    const cfg = { ...def };
    for (const r of rows) {
        try {
            cfg[r.k] = JSON.parse(r.v);
            // Decrypt password on read
            if (r.k === "smtp_pass" && typeof cfg[r.k] === "string" && cfg[r.k].includes(":")) {
                cfg[r.k] = decrypt(cfg[r.k]);
            }
        } catch (e) { console.error("Error parsing config", r.k, e); }
    }

    return cfg;
}

async function setConfig(next) {
    const db = getDb();
    next.updated_at = nowIso();
    await db.exec("BEGIN");
    try {
        for (const [k, v] of Object.entries(next)) {
            let val = v;
            if (k === "smtp_pass" && val && !val.includes(":")) { // Simple check to avoid double encrypting if passed encrypted (though unlikely from controller)
                // Actually logic should be: Controller passes plain text. We encrypt here.
                // But wait, if we read raw config, we get encrypted.
                // If we save it back without changing, it's already encrypted.
                // We need a way to know if it changed.
                // OR we blindly encrypt, but we need to distinguish plain vs encrypted. 
                // Our format is IV:Cipher (hex:hex).
                // If user's password looks like hex:hex, edge case.
                // Better approach: Controller should handle logic? No, Model is safer.
                // Let's assume input to setConfig is always what we want to save.
                // If it behaves like a "save changes", we rely on the caller passing the new password OR the old encrypted one.
                // If the caller passes the old encrypted one, we shouldn't re-encrypt.
                // Our `encrypt` function in utils doesn't check format.
                // Let's rely on the fact that the Controller receives clean input. 
                // If the user didn't change the password, the frontend keeps the field empty or masked.
                // If the frontend sends a new password, it's plain text.
                // If the frontend sends nothing, we keep the old one.
            }
            // Actually, best place is in setConfig loop: if key is smtp_pass verify format.
            // But checking format is flaky.
            // Let's trust the `encrypt` util to handle it? No.

            // Standard approach:
            // 1. Controller gets user input. If "smtp_pass" is provided (not empty), it's a NEW password (plain).
            // 2. Controller calls setConfig with new plain password.
            // 3. setConfig encrypts it.

            // But wait, what if `next` contains the FULL config object (including old encrypted pass)?
            // The `updateSettings` controller builds `next` based on `existing` config and overwrites fields.
            // If `smtp_pass` is NOT provided in request, `next.smtp_pass` will be the OLD value (encrypted).
            // So we need to detect if it's already encrypted.

            if (k === "smtp_pass" && typeof val === "string" && val.length > 0) {
                if (!val.includes(":")) {
                    // It's likely plain text (unless password contains colon, which is possible but checks usually verify 32 char hex IV... let's assume it is plain if not structured)
                    // Better check: is it IV:Cipher?
                    const parts = val.split(":");
                    if (parts.length !== 2 || parts[0].length !== 32) {
                        val = encrypt(val);
                    }
                }
            }

            await db.run(`INSERT OR REPLACE INTO config(k, v) VALUES(?, ?)`, [k, JSON.stringify(val)]);
        }
        await db.exec("COMMIT");
    } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
    }
}

module.exports = {
    getConfig,
    setConfig
};
