const { getConfig } = require("../models/Config");
const { buildInstances } = require("../services/InstanceService");
const { toCsv, PDFDocument } = require("../services/ExportService");

async function exportCsv(req, res) {
    const { from, to, status, periodicity, userId, groupId, search, isDelegated } = req.query || {};
    if (!from || !to) return res.status(400).json({ error: "Missing from/to" });

    const cfg = await getConfig();
    const rows = await buildInstances({
        from, to, status, periodicity, userId, groupId, search,
        isDelegated: isDelegated === 'true'
    }, cfg.country || "FR");

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="export_${from}_${to}.csv"`);
    res.send(csv);
}

async function exportPdf(req, res) {
    if (!PDFDocument) return res.status(500).json({ error: "pdfkit not installed" });

    const { from, to, status, periodicity, userId, groupId, search, isDelegated } = req.query || {};
    if (!from || !to) return res.status(400).json({ error: "Missing from/to" });

    const cfg = await getConfig();
    const rows = await buildInstances({
        from, to, status, periodicity, userId, groupId, search,
        isDelegated: isDelegated === 'true'
    }, cfg.country || "FR");

    const { generatePdf } = require("../services/ExportService"); // Lazy require to avoid circular dep if any (though none here)
    // Actually safe to require top level but let's just stick to module pattern.

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="export_${from}_${to}.pdf"`);

    const doc = generatePdf(rows, cfg, from, to);
    if (doc) {
        doc.pipe(res);
    } else {
        res.end(); // Should not happen given check above
    }
}

module.exports = {
    exportCsv,
    exportPdf
};
