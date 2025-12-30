
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { getConfig } = require("../models/Config");
const { getEmailRecipients, buildEmailTemplate } = require("./EmailService");
const { buildInstances } = require("./InstanceService");
const { getTimeZoneForCountry, isLastDayOfMonthInTZ, ymdFromDateInTZ, addDaysYMD, mondayOfWeek, ymdToString } = require("../utils/time");

let nodemailer = null;
let PDFDocument = null;
try { nodemailer = require("nodemailer"); } catch { }
try { PDFDocument = require("pdfkit"); } catch { }

// Shared PDF generation logic
function generatePdf(rows, cfg, from, to) {
    if (!PDFDocument) return null;
    const doc = new PDFDocument({ margin: 40 });

    // Helper: Date Formatter (No time)
    const fmt = (dStr) => {
        if (!dStr) return "";
        try {
            const date = new Date(dStr);
            return new Intl.DateTimeFormat(cfg.lang === 'FR' ? 'fr-FR' : 'en-GB', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(date);
        } catch { return String(dStr).split(' ')[0]; }
    };

    // --- PAGE 1: COVER & STATISTICS ---
    doc.fontSize(24).fillColor("#2563eb").text(cfg.title || "Taskmaster", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor("#555").text(`${t(cfg.lang || "EN", "from")} ${fmt(from)} ${t(cfg.lang || "EN", "to")} ${fmt(to)}`, { align: "center" });
    doc.moveDown(2);

    // Calculate Stats
    const stats = {
        validated: rows.filter(r => r.status === 'validated').length,
        failed: rows.filter(r => r.status === 'failed').length,
        missing: rows.filter(r => r.status === 'missing').length
    };

    // Total for 'Meaningful' stats (excluding pending/ferie)
    const totalMeaningful = stats.validated + stats.failed + stats.missing;

    doc.fontSize(18).fillColor("#000").text("Statistics", { align: "left", underline: true });
    doc.moveDown(1);

    // Draw Stats Text
    const drawStat = (label, count, color) => {
        doc.fontSize(12).fillColor(color).text(`• ${label}: ${count}`, { continued: false });
        doc.moveDown(0.5);
    };

    drawStat(`${t(cfg.lang || "EN", "validated")}`, stats.validated, "#059669"); // Green
    drawStat(`${t(cfg.lang || "EN", "failed")}`, stats.failed, "#e11d48ff");    // Red
    drawStat(`${t(cfg.lang || "EN", "missing")}`, stats.missing, "#d97706");  // Amber

    // Draw Pie Chart (if there is data)
    if (totalMeaningful > 0) {
        // --- PIE CHART ---
        const centerX = 150; // Move Left
        const centerY = 350;
        const radius = 70;
        let startAngle = 0;

        const data = [
            { label: 'Validated', count: stats.validated, color: "#059669" },
            { label: 'Failed', count: stats.failed, color: "#e11d48ff" },
            { label: 'Missing', count: stats.missing, color: "#d97706" }
        ];

        doc.fontSize(12).fillColor("#000").text("Status Breakdown (Pie)", 80, 250);

        for (const slice of data) {
            if (slice.count === 0) continue;
            const sliceAngle = (slice.count / totalMeaningful) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            const midAngle = startAngle + sliceAngle / 2;

            doc.save();
            doc.fillColor(slice.color);
            doc.path(
                `M ${centerX},${centerY} L ${centerX + radius * Math.cos(startAngle)},${centerY + radius * Math.sin(startAngle)} A ${radius},${radius} 0 ${sliceAngle > Math.PI ? 1 : 0},1 ${centerX + radius * Math.cos(endAngle)},${centerY + radius * Math.sin(endAngle)} Z`
            ).fill();
            doc.restore();

            // Draw Percentage
            const percent = Math.round((slice.count / totalMeaningful) * 100) + "%";
            const textX = centerX + (radius / 1.5) * Math.cos(midAngle);
            const textY = centerY + (radius / 1.5) * Math.sin(midAngle) - 5;

            doc.fontSize(10).fillColor("#fff").text(percent, textX, textY, { width: 40, align: 'center' });

            startAngle = endAngle;
        }

        // --- DAILY GROUPED BAR CHART ---
        const daily = {};
        rows.forEach(r => {
            const d = (r.start_ts || r.start_date || "").split("T")[0];
            if (!d) return;
            if (!daily[d]) daily[d] = { validated: 0, failed: 0, missing: 0 };
            if (r.status === 'validated') daily[d].validated++;
            if (r.status === 'failed') daily[d].failed++;
            if (r.status === 'missing') daily[d].missing++;
        });

        const days = Object.keys(daily).sort();
        if (days.length > 0) {
            const chartTop = 460;
            const chartLeft = 50;
            const chartH = 200;
            const chartW = 500;
            const chartBottom = chartTop + chartH;

            doc.fontSize(12).fillColor("#000").text("Daily Activity (Grouped)", chartLeft, chartTop - 25);

            // Draw axes
            doc.lineWidth(1).strokeColor("#e5e7eb");
            doc.moveTo(chartLeft, chartTop).lineTo(chartLeft, chartBottom).lineTo(chartLeft + chartW, chartBottom).stroke();

            // Max Y determination
            let maxCount = 0;
            days.forEach(d => {
                const v = daily[d].validated;
                const f = daily[d].failed;
                const m = daily[d].missing;
                if (v > maxCount) maxCount = v;
                if (f > maxCount) maxCount = f;
                if (m > maxCount) maxCount = m;
            });
            if (maxCount === 0) maxCount = 1;
            maxCount = Math.ceil(maxCount * 1.2); // +20% headroom for labels

            /* Layout calculation:
               For each Day bucket: 
                 - Padding (Left/Right)
                 - 3 Bars (V, F, M) with tiny gap between them
               
               bucketWidth = chartW / days.length
               Inside bucket: 10% pad, 80% content, 10% pad
               contentWidth = bucketWidth * 0.8
               singleBarWidth = contentWidth / 3
            */

            const bucketWidth = chartW / days.length;
            // Cap max bar width to avoid giant bars on few days
            let singleBarWidth = (bucketWidth * 0.8) / 3;
            if (singleBarWidth > 25) singleBarWidth = 25;

            const groupWidth = singleBarWidth * 3;
            const sidePad = (bucketWidth - groupWidth) / 2;

            days.forEach((d, i) => {
                const bucketX = chartLeft + (i * bucketWidth);
                const groupX = bucketX + sidePad;
                const s = daily[d];

                const drawBar = (val, color, index) => {
                    if (val === 0) return;
                    const h = (val / maxCount) * chartH;
                    const bx = groupX + (index * singleBarWidth);
                    const by = chartBottom - h;

                    // Bar
                    doc.rect(bx, by, singleBarWidth - 1, h).fillColor(color).fill(); // -1 for visual gap

                    // Value Label
                    doc.fontSize(8).fillColor("#000").text(String(val), bx, by - 10, { width: singleBarWidth, align: 'center' });
                };

                drawBar(s.validated, "#059669", 0);
                drawBar(s.failed, "#e11d48", 1);
                drawBar(s.missing, "#d97706", 2);

                // Day Label
                const dayLabel = d.split('-')[2];
                const showLabel = days.length < 32 || i % Math.ceil(days.length / 32) === 0;
                if (showLabel) {
                    doc.fontSize(8).fillColor("#64748b").text(dayLabel, bucketX, chartBottom + 5, { width: bucketWidth, align: 'center' });
                }
            });

            // Y Axis labels
            doc.fontSize(8).fillColor("#999").text(String(maxCount), chartLeft - 25, chartTop);
            doc.text("0", chartLeft - 15, chartBottom - 5);
        }
    }

    // Add Page Break for Task List
    doc.addPage();

    // --- PAGE 2+: TASK LIST ---
    doc.fontSize(16).fillColor("#000").text("Task List", { align: "left" });
    doc.moveDown(1);

    for (const r of rows) {
        // Safe check for overlap: Check free space handling
        if (doc.y > 700) doc.addPage();

        // Status Color Mapping
        let statusColor = "#555";
        if (r.status === 'validated') statusColor = "#059669";
        if (r.status === 'failed') statusColor = "#e11d48";
        if (r.status === 'missing') statusColor = "#d97706";
        if (r.status === 'pending') statusColor = "#2563eb";
        if (r.status === 'ferie') statusColor = "#0ea5e9";

        // Draw Task Block
        doc.fontSize(11).fillColor("#000").text(`${String(r.periodicity || "").toUpperCase()} · ${r.description}`, { width: 500 });
        doc.moveDown(0.3); // Explicit move

        doc.fontSize(9).fillColor("#555").text(`Start: ${fmt(r.start_ts || r.start_date)}  |  End: ${fmt(r.end_ts || r.end_date)}`, { width: 500 });
        doc.moveDown(0.3);

        // Status Line
        const startX = doc.x;
        const startY = doc.y;

        doc.fillColor(statusColor).text(`Status: ${r.status.toUpperCase()}`, startX, startY, { continued: false, width: 500 });

        // Updated by username (if available for validated/failed)
        if (r.updated_by_username && (r.status === 'validated' || r.status === 'failed')) {
            doc.moveDown(0.2);
            doc.fillColor("#64748b").text(`${r.status === 'validated' ? 'Validated by' : 'Failed by'}: ${r.updated_by_username}`, { width: 500 });
        }

        // Assigned Groups
        if (r.assigned_groups && r.assigned_groups.length > 0) {
            doc.moveDown(0.2);
            doc.fillColor("#6366f1").text(`Assigned Groups: ${r.assigned_groups.join(', ')}`, { width: 500 });
        } else if (r.assigned_group && r.assigned_group !== 'all') {
            doc.moveDown(0.2);
            doc.fillColor("#6366f1").text(`Assigned Group: ${r.assigned_group}`, { width: 500 });
        }

        // Assigned Users
        if (r.assigned_usernames && r.assigned_usernames.length > 0 && !r.is_delegated) {
            doc.moveDown(0.2);
            doc.fillColor("#8b5cf6").text(`Assigned Users: ${r.assigned_usernames.join(', ')}`, { width: 500 });
        }

        // Delegation
        if (r.is_delegated && r.assigned_usernames && r.assigned_usernames.length > 0) {
            doc.moveDown(0.2);
            doc.fillColor("#ec4899").text(`Delegated to: ${r.assigned_usernames[0]}`, { width: 500 });
        }

        // Comment on next line if exists
        if (r.comment) {
            doc.moveDown(0.2);
            doc.fillColor("#e11d48").text(`[Comment: ${r.comment}]`, { width: 500 });
        }

        if (r.procedure_url) {
            doc.moveDown(0.2);
            doc.fillColor("#2563eb").text(`Procedure: ${r.procedure_url}`, { link: r.procedure_url, underline: true, width: 500 });
        }

        doc.moveDown(1);
        doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
    }

    doc.end();
    return doc;
}

// Helper for minimal translations inside the PDF generator (avoids requiring the full frontend constants)
function t(lang, key) {
    const dict = {
        FR: {
            from: "Du", to: "Au", all: "Total", validated: "Validé", failed: "Échec", missing: "Manqué", pending: "En attente", ferieNote: "Férié"
        },
        EN: {
            from: "From", to: "To", all: "Total", validated: "Validated", failed: "Failed", missing: "Missing", pending: "Pending", ferieNote: "Public Holiday"
        }
    };
    return (dict[lang] || dict.EN)[key] || key;
}

function toCsv(rows) {
    const esc = (v) => {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const header = ["task_id", "periodicity", "description", "procedure_url", "start_ts", "end_ts", "status", "comment", "updated_by", "assigned_groups", "assigned_users", "delegated_to"];
    const lines = [header.join(",")];
    for (const r of rows) {
        // Format groups
        let groupsStr = "";
        if (r.assigned_groups && r.assigned_groups.length > 0) {
            groupsStr = r.assigned_groups.join("; ");
        } else if (r.assigned_group && r.assigned_group !== 'all') {
            groupsStr = r.assigned_group;
        }

        // Format assigned users
        let usersStr = "";
        if (r.assigned_usernames && r.assigned_usernames.length > 0) {
            usersStr = r.assigned_usernames.join("; ");
        }

        // Delegation
        let delegatedStr = "";
        if (r.is_delegated && r.assigned_usernames && r.assigned_usernames.length > 0) {
            delegatedStr = r.assigned_usernames[0]; // First one is the delegate
        }

        lines.push([
            esc(r.task_id),
            esc(r.periodicity),
            esc(r.description),
            esc(r.procedure_url),
            esc(r.start_ts),
            esc(r.end_ts),
            esc(r.status),
            esc(r.comment || ""),
            esc(r.updated_by_username || ""),
            esc(groupsStr),
            esc(usersStr),
            esc(delegatedStr)
        ].join(","));
    }
    return lines.join("\n");
}

function ensureExportDir(dir) {
    const p = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
}

function computeAutoExportRange(cfg) {
    const country = cfg.country || "FR";
    const tz = getTimeZoneForCountry(country);
    const today = ymdFromDateInTZ(new Date(), tz);

    const fromOff = parseInt(cfg.auto_export_from_offset_days, 10) || 0;
    const toOff = parseInt(cfg.auto_export_to_offset_days, 10) || 0;

    if (cfg.auto_export_mode === "week") {
        const mon = mondayOfWeek(today);
        return {
            from: ymdToString(addDaysYMD(mon, fromOff)),
            to: ymdToString(addDaysYMD(today, toOff))
        };
    }

    if (cfg.auto_export_mode === "month_to_date") {
        const first = { y: today.y, m: today.m, d: 1 };
        return {
            from: ymdToString(addDaysYMD(first, fromOff)),
            to: ymdToString(addDaysYMD(today, toOff))
        };
    }

    return {
        from: ymdToString(addDaysYMD(today, fromOff)),
        to: ymdToString(addDaysYMD(today, toOff))
    };
}

async function executeExport(cfg, { from, to, status = "", search = "", skipMail = false }) {
    const country = cfg.country || "FR";
    const rows = await buildInstances({ from, to, status, search }, country);

    const exportDir = ensureExportDir(cfg.export_dir || "./exports");
    const generatedFiles = [];

    // Determine what needs to be generated (Union of Local Export Settings and Mail Export Settings)
    // Local: default to true if undefined/missing, unless it is strictly false
    const localCsv = cfg.export_format_csv !== false;
    const localPdf = cfg.export_format_pdf !== false;

    // Mail: must be explicitly true (or default true). safely handled by checking truthiness if defaults are loaded.
    // However, to fix potential "false" string or 0 integer issues, we cast to boolean checks if possible,
    // but since default is true, we must allow "undefined" to mean true (via config defaults).
    // The Config model loads defaults. valid values are true/false.
    // If we want to strictly respect "false", we should ensure we don't accidentally treat "0" or null as true.
    // Current: !== false. (0 !== false => true). This is the bug if DB has 0.
    // Fix: We know it's boolean in intention.
    // If we use !!cfg.mail_export_format_csv, then 0 becomes false. false becomes false. true becomes true.
    const mailCsv = cfg.mail_enabled && cfg.mail_export_enabled && !!cfg.mail_export_format_csv;
    const mailPdf = cfg.mail_enabled && cfg.mail_export_enabled && !!cfg.mail_export_format_pdf;

    // If skipping mail (Test Export button), we only care about local formats.
    // If real auto-export, we need union of both.
    const needCsv = localCsv || (!skipMail && mailCsv);
    const needPdf = localPdf || (!skipMail && mailPdf);

    // Generate CSV if needed
    if (needCsv) {
        const csv = toCsv(rows);
        const fileName = `export_${from}_${to}.csv`;
        const filePath = path.join(exportDir, fileName);
        let created = false;
        if (!fs.existsSync(filePath)) {
            await fsp.writeFile(filePath, csv, "utf8");
            created = true;
        }
        generatedFiles.push({ type: 'csv', filename: fileName, path: filePath, created });
    }

    // Generate PDF if needed
    if (needPdf && PDFDocument) {
        const pdfDoc = generatePdf(rows, cfg, from, to);
        if (pdfDoc) {
            const fileName = `export_${from}_${to}.pdf`;
            const filePath = path.join(exportDir, fileName);
            let created = false;
            // Write PDF stream to file
            if (!fs.existsSync(filePath)) {
                created = true;
                const stream = fs.createWriteStream(filePath);
                pdfDoc.pipe(stream);
                await new Promise((resolve) => stream.on("finish", resolve));
            }
            generatedFiles.push({ type: 'pdf', filename: fileName, path: filePath, created });
        }
    }

    if (!skipMail && cfg.mail_enabled && cfg.mail_export_enabled && nodemailer && generatedFiles.length > 0) {
        // Filter attachments: must matches capabilities AND user config
        const filesToSend = generatedFiles.filter(f => {
            if (f.type === 'csv') return mailCsv;
            if (f.type === 'pdf') return mailPdf;
            return false;
        });

        if (filesToSend.length > 0 && cfg.smtp_host && cfg.smtp_port && cfg.mail_from) {
            const recipients = await getEmailRecipients(null, cfg, 'mail_export_recipients');
            console.log(`[Export] Found ${recipients.length} recipients for export email:`, recipients);

            if (recipients.length > 0) {
                const port = parseInt(cfg.smtp_port, 10) || 587;
                let useSecure = !!cfg.smtp_secure;
                if (port === 587 && useSecure) useSecure = false;

                const transporter = nodemailer.createTransport({
                    host: cfg.smtp_host,
                    port: port,
                    secure: useSecure,
                    auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass || "" } : undefined
                });

                console.log(`[Export] Sending mail via ${cfg.smtp_host}:${port}...`);
                const title = `${cfg.title || 'Taskmaster'} Export`;
                const content = `
                    <div style="margin-bottom: 30px; text-align: center;">
                        <div style="display: inline-block; padding: 15px 30px; background: #e0e7ff; border-radius: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #4338ca; font-size: 18px; font-weight: 600;">
                                📊 Export Generated
                            </p>
                        </div>
                        <p style="color: #4b5563; font-size: 16px; margin: 0;">
                            Your automated export for the period:
                        </p>
                        <p style="color: #1f2937; font-size: 18px; font-weight: 700; margin: 10px 0 0 0;">
                            ${from} &rarr; ${to}
                        </p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                        <ul style="margin: 0; padding: 0; list-style: none;">
                            <li style="margin-bottom: 10px; color: #374151; font-size: 15px;">
                                📝 <strong>Rows:</strong> ${rows.length}
                            </li>
                            <li style="margin-bottom: 10px; color: #374151; font-size: 15px;">
                                📁 <strong>Attached files:</strong> ${filesToSend.length}
                            </li>
                            <li style="color: #374151; font-size: 15px;">
                                📅 <strong>Generated on:</strong> ${new Date().toLocaleString()}
                            </li>
                        </ul>
                    </div>

                    <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px;">
                        The export files (CSV/PDF) are attached to this email.
                    </p>
                `;
                const html = buildEmailTemplate(title, content, cfg.title || "Taskmaster");

                await transporter.sendMail({
                    from: cfg.mail_from,
                    to: recipients.join(', '),
                    subject: `${cfg.title || 'Taskmaster'} Export: ${from} -> ${to}`,
                    html: html,
                    attachments: filesToSend.map(f => ({ filename: f.filename, path: f.path }))
                });
                console.log(`[Export] Email sent successfully.`);
            } else {
                console.warn(`[Export] No recipients found for email export.`);
            }
        } else {
            console.warn(`[Export] Skipping email: missing files or SMTP config.`);
        }
    }

    // Cleanup files that were created ONLY for email and shouldn't be persisted locally
    for (const f of generatedFiles) {
        const keepLocally = (f.type === 'csv' && localCsv) || (f.type === 'pdf' && localPdf);
        if (!keepLocally && f.created) {
            try {
                await fsp.unlink(f.path);
            } catch (ignore) { }
        }
    }
}

async function runAutoExportOnce(force = false, skipMail = false) {
    const cfg = await getConfig();
    if (!cfg.auto_export_enabled && !force) return;

    // If month_to_date, we typically want the last day.
    // However, if the user customized the cron to run on a specific day (not the default 28-31 range),
    // we should honor that day and SKIP the isLastDayOfMonth check.
    // We infer "Last Day intent" if the cron contains "28-31".
    const isEndMonthCron = (cfg.auto_export_cron || "").includes("28-31");
    if (cfg.auto_export_mode === "month_to_date" && isEndMonthCron && !isLastDayOfMonthInTZ(cfg.country || "FR") && !force) {
        return;
    }

    const { from, to } = computeAutoExportRange(cfg);
    await executeExport(cfg, { from, to, skipMail });
}

async function cleanupOldExports(retentionDays) {
    if (!retentionDays || retentionDays <= 0) return;
    const cfg = await getConfig();
    const exportDir = ensureExportDir(cfg.export_dir || "./exports");

    // retentionDays -> milliseconds
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
        const files = await fsp.readdir(exportDir);
        for (const file of files) {
            const filePath = path.join(exportDir, file);
            try {
                const stats = await fsp.stat(filePath);
                if (stats.isFile()) {
                    const age = now - stats.mtimeMs;
                    if (age > maxAgeMs) {
                        console.log(`Cleanup: deleting ${file} (age: ${(age / 86400000).toFixed(1)} days)`);
                        await fsp.unlink(filePath);
                    }
                }
            } catch (err) {
                console.error("Cleanup error processing file:", file, err);
            }
        }
    } catch (e) {
        console.error("Cleanup error reading dir:", e);
    }
}

module.exports = {
    toCsv,
    runAutoExportOnce,
    executeExport,
    cleanupOldExports,
    generatePdf,
    computeAutoExportRange,
    PDFDocument
};
