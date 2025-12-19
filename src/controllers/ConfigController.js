const fs = require('fs');
const path = require('path');
const { getConfig, setConfig } = require("../models/Config");
const { hashPassword } = require("../utils/security");
const { reloadSchedulers } = require("../services/SchedulerService");
const { getTimeZoneForCountry } = require("../utils/time");
const cronParser = require("cron-parser");
let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch { }

async function getPublicConfig(_req, res) {
    const cfg = await getConfig();
    const out = { ...cfg };
    delete out.admin_password_hash;
    delete out.user_password_hash;
    if (out.smtp_pass) out.smtp_pass = "••••••••";
    res.json(out);
}

async function needsSetup(_req, res) {
    const cfg = await getConfig();
    const needs = !(cfg.admin_password_hash && cfg.user_password_hash);
    res.json({ needs_setup: needs });
}

async function setup(req, res) {
    const cfg = await getConfig();

    if (cfg.admin_password_hash || cfg.user_password_hash) {
        return res.status(400).json({ error: "Already setup" });
    }

    const adminPwd = (req.body.admin_password || "").trim();
    const userPwd = (req.body.user_password || "").trim();
    if (!adminPwd || !userPwd) return res.status(400).json({ error: "Missing passwords" });

    const next = { ...cfg };

    next.admin_password_hash = hashPassword(adminPwd);
    next.user_password_hash = hashPassword(userPwd);

    if (req.body.title) next.title = String(req.body.title);
    if (req.body.subtitle) next.subtitle = String(req.body.subtitle);
    if (req.body.country) next.country = String(req.body.country);
    if (req.body.lang) next.lang = String(req.body.lang);
    if (req.body.theme) next.theme = String(req.body.theme);
    if (req.body.display_mode) next.display_mode = String(req.body.display_mode);

    // Auto export
    if (typeof req.body.auto_export_enabled !== "undefined") next.auto_export_enabled = req.body.auto_export_enabled === "1";
    if (req.body.auto_export_cron) next.auto_export_cron = String(req.body.auto_export_cron);
    if (req.body.auto_export_mode) next.auto_export_mode = String(req.body.auto_export_mode);
    if (typeof req.body.auto_export_from_offset_days !== "undefined") next.auto_export_from_offset_days = parseInt(req.body.auto_export_from_offset_days, 10) || 0;
    if (typeof req.body.auto_export_to_offset_days !== "undefined") next.auto_export_to_offset_days = parseInt(req.body.auto_export_to_offset_days, 10) || 0;
    if (typeof req.body.export_retention_days !== "undefined") next.export_retention_days = parseInt(req.body.export_retention_days, 10) || 0;
    if (req.body.export_dir) next.export_dir = String(req.body.export_dir);

    // Mail
    if (typeof req.body.mail_enabled !== "undefined") next.mail_enabled = req.body.mail_enabled === "1";
    if (req.body.smtp_host) next.smtp_host = String(req.body.smtp_host);
    if (req.body.smtp_port) next.smtp_port = String(req.body.smtp_port);
    if (typeof req.body.smtp_secure !== "undefined") next.smtp_secure = req.body.smtp_secure === "1";
    if (req.body.smtp_user) next.smtp_user = String(req.body.smtp_user);
    if (req.body.smtp_pass) next.smtp_pass = String(req.body.smtp_pass);
    if (req.body.mail_from) next.mail_from = String(req.body.mail_from);
    if (req.body.mail_to) next.mail_to = String(req.body.mail_to);
    if (typeof req.body.mail_missing_enabled !== "undefined") next.mail_missing_enabled = req.body.mail_missing_enabled === "1";
    if (typeof req.body.mail_export_enabled !== "undefined") next.mail_export_enabled = req.body.mail_export_enabled === "1";

    // Files
    const files = req.files || {};
    if (files.logo_file?.[0]) next.logo_url = "/uploads/logos/" + files.logo_file[0].filename;
    if (files.favicon_file?.[0]) next.favicon_url = "/uploads/logos/" + files.favicon_file[0].filename;

    await setConfig(next);
    await reloadSchedulers();
    res.json({ ok: true });
}

async function updateSettings(req, res) {
    const cfg = await getConfig();
    const next = { ...cfg };

    // Helper to delete old file
    const deleteOldFile = (url) => {
        if (!url) return;
        try {
            // url is like "/uploads/foo.png".
            // File system path: client/public/uploads/foo.png
            // We assume url starts with /
            const relativePath = url.startsWith('/') ? url.slice(1) : url;
            const fullPath = path.join(process.cwd(), "client", "public", relativePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        } catch (e) {
            console.error("Failed to delete old file:", url, e);
        }
    };

    if (req.body.title) next.title = String(req.body.title);

    // Security
    if (req.body.admin_password && req.body.admin_password.trim()) {
        next.admin_password_hash = hashPassword(req.body.admin_password.trim());
    }
    if (req.body.user_password && req.body.user_password.trim()) {
        next.user_password_hash = hashPassword(req.body.user_password.trim());
    }
    if (req.body.subtitle) next.subtitle = String(req.body.subtitle);
    if (req.body.country) next.country = String(req.body.country);
    if (req.body.lang) next.lang = String(req.body.lang);
    if (req.body.theme) next.theme = String(req.body.theme);
    if (req.body.display_mode) next.display_mode = String(req.body.display_mode);

    if (typeof req.body.auto_export_enabled !== "undefined") next.auto_export_enabled = req.body.auto_export_enabled === "1";
    if (req.body.auto_export_cron) next.auto_export_cron = String(req.body.auto_export_cron);
    if (req.body.auto_export_mode) next.auto_export_mode = String(req.body.auto_export_mode);
    if (typeof req.body.auto_export_from_offset_days !== "undefined") next.auto_export_from_offset_days = parseInt(req.body.auto_export_from_offset_days, 10) || 0;
    if (typeof req.body.auto_export_to_offset_days !== "undefined") next.auto_export_to_offset_days = parseInt(req.body.auto_export_to_offset_days, 10) || 0;
    if (typeof req.body.export_retention_days !== "undefined") next.export_retention_days = parseInt(req.body.export_retention_days, 10) || 0;
    if (req.body.export_dir) next.export_dir = String(req.body.export_dir);
    if (typeof req.body.export_format_csv !== "undefined") next.export_format_csv = req.body.export_format_csv === "1";
    if (typeof req.body.export_format_pdf !== "undefined") next.export_format_pdf = req.body.export_format_pdf === "1";

    if (typeof req.body.mail_enabled !== "undefined") next.mail_enabled = req.body.mail_enabled === "1";
    if (req.body.smtp_host) next.smtp_host = String(req.body.smtp_host);
    if (req.body.smtp_port) next.smtp_port = String(req.body.smtp_port);
    if (typeof req.body.smtp_secure !== "undefined") next.smtp_secure = req.body.smtp_secure === "1";
    if (req.body.smtp_user) next.smtp_user = String(req.body.smtp_user);
    if (req.body.smtp_pass && req.body.smtp_pass !== "••••••••") next.smtp_pass = String(req.body.smtp_pass);
    if (req.body.mail_from) next.mail_from = String(req.body.mail_from);
    if (req.body.mail_to) next.mail_to = String(req.body.mail_to);
    if (typeof req.body.mail_missing_enabled !== "undefined") next.mail_missing_enabled = req.body.mail_missing_enabled === "1";
    if (typeof req.body.mail_export_enabled !== "undefined") next.mail_export_enabled = req.body.mail_export_enabled === "1";
    if (typeof req.body.mail_export_format_csv !== "undefined") next.mail_export_format_csv = req.body.mail_export_format_csv === "1";
    if (typeof req.body.mail_export_format_pdf !== "undefined") next.mail_export_format_pdf = req.body.mail_export_format_pdf === "1";

    const files = req.files || {};
    if (files.logo_file?.[0]) {
        const newUrl = "/uploads/logos/" + files.logo_file[0].filename;
        if (cfg.logo_url && cfg.logo_url !== newUrl) deleteOldFile(cfg.logo_url);
        next.logo_url = newUrl;
    }
    if (files.favicon_file?.[0]) {
        const newUrl = "/uploads/logos/" + files.favicon_file[0].filename;
        if (cfg.favicon_url && cfg.favicon_url !== newUrl) deleteOldFile(cfg.favicon_url);
        next.favicon_url = newUrl;
    }

    await setConfig(next);
    await reloadSchedulers();

    res.json({
        title: next.title,
        subtitle: next.subtitle,
        logo_url: next.logo_url,
        favicon_url: next.favicon_url,
        country: next.country,
        lang: next.lang,
        theme: next.theme,
        display_mode: next.display_mode,
        mail_enabled: next.mail_enabled,
        smtp_host: next.smtp_host,
        smtp_port: next.smtp_port,
        smtp_user: next.smtp_user,
        smtp_pass: next.smtp_pass ? "••••••••" : "",
        smtp_secure: next.smtp_secure,
        mail_from: next.mail_from,
        mail_to: next.mail_to,
        mail_missing_enabled: next.mail_missing_enabled,
        mail_export_enabled: next.mail_export_enabled,
        mail_export_format_csv: next.mail_export_format_csv,
        mail_export_format_pdf: next.mail_export_format_pdf,
        auto_export_enabled: next.auto_export_enabled,
        auto_export_cron: next.auto_export_cron,
        auto_export_mode: next.auto_export_mode,
        auto_export_from_offset_days: next.auto_export_from_offset_days,
        auto_export_to_offset_days: next.auto_export_to_offset_days,
        export_retention_days: next.export_retention_days,
        export_dir: next.export_dir,
        export_format_csv: next.export_format_csv,
        export_format_pdf: next.export_format_pdf
    });
}

async function testMail(req, res) {
    if (!nodemailer) return res.status(500).json({ error: "nodemailer not installed" });

    const config = await getConfig();
    // Merge DB config with Request body (Request body takes precedence if provided)
    // But if request body fields are empty strings, we might want to use DB config?
    // User intent: if they typed something, use it. If they left it as is (or empty due to UI bug), use DB.
    // So we use ||.

    const body = req.body || {};

    const smtp_host = body.smtp_host || config.smtp_host;
    const smtp_port = body.smtp_port || config.smtp_port;
    const smtp_secure = (typeof body.smtp_secure !== "undefined") ? body.smtp_secure : config.smtp_secure;
    const smtp_user = body.smtp_user || config.smtp_user;
    const smtp_pass = (body.smtp_pass && body.smtp_pass !== "••••••••") ? body.smtp_pass : config.smtp_pass;
    const mail_from = body.mail_from || config.mail_from;
    const mail_to = body.mail_to || config.mail_to;

    if (!smtp_host || !smtp_port || !mail_from || !mail_to) {
        return res.status(400).json({ error: "Missing SMTP fields" });
    }

    try {
        const port = parseInt(smtp_port, 10) || 587;
        let useSecure = (smtp_secure === "1" || smtp_secure === true);
        if (port === 587 && useSecure) useSecure = false;

        const transporter = nodemailer.createTransport({
            host: smtp_host,
            port: port,
            secure: useSecure,
            auth: smtp_user ? { user: smtp_user, pass: smtp_pass || "" } : undefined
        });

        await transporter.sendMail({
            from: mail_from,
            to: mail_to,
            subject: "Taskmaster SMTP test",
            text: "SMTP OK"
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
}

const { runAutoExportOnce, executeExport } = require("../services/ExportService");

async function testAutoExport(req, res) {
    try {
        await runAutoExportOnce(true, true);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e?.message || e) });
    }
}

async function testExportMail(req, res) {
    try {
        const cfg = await getConfig();
        if (!cfg.smtp_host || !cfg.smtp_port || !cfg.mail_from || !cfg.mail_to) {
            return res.status(400).json({ error: "Missing SMTP fields" });
        }
        if (!cfg.mail_enabled) {
            return res.status(400).json({ error: "Email is disabled in settings" });
        }

        const { from, to, status } = req.body;
        if (from && to) {
            await executeExport(cfg, { from, to, status: status || "" });
        } else {
            await runAutoExportOnce(true);
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e?.message || e) });
    }
}

async function cronPreview(req, res) {
    try {
        const { cron, country } = req.body;
        if (!cron) return res.status(400).json({ error: "Missing cron" });

        const tz = getTimeZoneForCountry(country || "FR");
        // cron-parser v5 uses CronExpressionParser.parse
        const interval = cronParser.CronExpressionParser.parse(cron, { tz });

        const nextDate = interval.next().toDate();
        res.json({
            valid: true,
            next: nextDate.toISOString(),
            timezone: tz
        });
    } catch (e) {
        res.json({ valid: false, error: String(e.message) });
    }
}

module.exports = {
    getPublicConfig,
    needsSetup,
    setup,
    updateSettings,
    testMail,
    testExportMail,
    testAutoExport,
    cronPreview
};
