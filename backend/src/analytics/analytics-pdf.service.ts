import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { AnalyticsService } from './analytics.service';
import type { OverviewResponse, TaskComplianceItem } from './dto';

interface PdfGenerationData {
  overview: OverviewResponse;
  tasks: TaskComplianceItem[];
  startDate: string;
  endDate: string;
}

@Injectable()
export class AnalyticsPdfService {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async generate(startDate: string, endDate: string): Promise<Buffer> {
    const [overview, tasks] = await Promise.all([
      this.analyticsService.getOverview(startDate, endDate),
      this.analyticsService.getByTask(startDate, endDate, 9999),
    ]);

    const html = this.buildHtml({ overview, tasks, startDate, endDate });

    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      landscape: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private buildHtml(data: PdfGenerationData): string {
    const { overview, tasks, startDate, endDate } = data;

    const rateColor =
      overview.complianceRate >= 90
        ? '#22c55e'
        : overview.complianceRate >= 70
          ? '#f59e0b'
          : '#ef4444';
    const rateColorLight =
      overview.complianceRate >= 90
        ? '#86efac'
        : overview.complianceRate >= 70
          ? '#fde68a'
          : '#fca5a5';

    const tasksHtml =
      tasks.length > 0
        ? tasks
            .map((t) => {
              const badgeClass =
                t.complianceRate >= 90
                  ? 'badge-green'
                  : t.complianceRate >= 70
                    ? 'badge-orange'
                    : 'badge-red';
              return `<tr>
          <td>${this.escapeHtml(t.taskName)}</td>
          <td>${t.total}</td>
          <td>${t.failed > 0 ? `<span style="color:#dc2626;font-weight:600">${t.failed}</span>` : '0'}</td>
          <td><span class="badge ${badgeClass}">${t.complianceRate.toFixed(1)}%</span></td>
        </tr>`;
            })
            .join('')
        : `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:24px;">Aucune tâche sur cette période</td></tr>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1e293b; background: #ffffff; }
  
  .header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #06b6d4 100%);
    padding: 48px 60px 40px;
    color: white;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -40%; right: -10%;
    width: 400px; height: 400px;
    background: rgba(255,255,255,0.05);
    border-radius: 50%;
  }
  .header h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
  .header .subtitle { font-size: 13px; opacity: 0.85; margin-top: 6px; font-weight: 400; }
  .header .period {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 20px;
    padding: 6px 18px;
    font-size: 12px;
    font-weight: 500;
    margin-top: 14px;
  }
  .content { padding: 40px 60px; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 40px;
  }
  .kpi-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .kpi-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
  }
  .kpi-card.success::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
  .kpi-card.failed::before { background: linear-gradient(90deg, #ef4444, #f87171); }
  .kpi-card.missing::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .kpi-card.total::before { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
  .kpi-value { font-size: 36px; font-weight: 800; letter-spacing: -1px; }
  .kpi-label { font-size: 12px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .success .kpi-value { color: #16a34a; }
  .failed .kpi-value { color: #dc2626; }
  .missing .kpi-value { color: #d97706; }
  .total .kpi-value { color: #2563eb; }
  .compliance-section {
    text-align: center;
    padding: 36px;
    margin-bottom: 40px;
    background: linear-gradient(135deg, #f0f9ff 0%, #f8fafc 100%);
    border-radius: 20px;
    border: 1px solid #e0f2fe;
  }
  .compliance-label { font-size: 13px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
  .compliance-value { font-size: 64px; font-weight: 800; letter-spacing: -2px; margin-top: 8px; }
  .compliance-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin-top: 16px; max-width: 400px; margin-left: auto; margin-right: auto; overflow: hidden; }
  .compliance-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::before {
    content: '';
    width: 4px;
    height: 24px;
    background: linear-gradient(180deg, #3b82f6, #06b6d4);
    border-radius: 2px;
  }
  table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
  thead th {
    background: #0f172a;
    color: white;
    padding: 14px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
  }
  thead th:last-child { text-align: right; }
  thead th:nth-child(2), thead th:nth-child(3) { text-align: center; }
  tbody td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td:last-child { text-align: right; font-weight: 600; }
  tbody td:nth-child(2), tbody td:nth-child(3) { text-align: center; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .badge-orange { background: #fff7ed; color: #d97706; }
  .badge-red { background: #fef2f2; color: #dc2626; }
  .footer {
    text-align: center;
    padding: 24px 60px;
    font-size: 10px;
    color: #94a3b8;
    border-top: 1px solid #f1f5f9;
  }
  .footer .logo { font-weight: 700; color: #64748b; }
  @page { margin: 0; }
</style>
</head>
<body>
<div class="header">
  <h1>📊 Rapport de Conformité</h1>
  <div class="subtitle">Analyse de performance des tâches</div>
  <div class="period">📅 ${startDate} → ${endDate}</div>
</div>
<div class="content">
  <div class="kpi-grid">
    <div class="kpi-card success">
      <div class="kpi-value">${overview.success}</div>
      <div class="kpi-label">Succès</div>
    </div>
    <div class="kpi-card failed">
      <div class="kpi-value">${overview.failed}</div>
      <div class="kpi-label">Échecs</div>
    </div>
    <div class="kpi-card missing">
      <div class="kpi-value">${overview.missing}</div>
      <div class="kpi-label">Manquants</div>
    </div>
    <div class="kpi-card total">
      <div class="kpi-value">${overview.total}</div>
      <div class="kpi-label">Total</div>
    </div>
  </div>
  <div class="compliance-section">
    <div class="compliance-label">Taux de conformité global</div>
    <div class="compliance-value" style="color: ${rateColor}">${overview.complianceRate.toFixed(1)}%</div>
    <div class="compliance-bar">
      <div class="compliance-bar-fill" style="width: ${Math.min(overview.complianceRate, 100)}%; background: linear-gradient(90deg, ${rateColor}, ${rateColorLight});"></div>
    </div>
  </div>
  <!-- TABLE -->
  <div class="section-title">Conformité par tâche</div>
  <table>
    <thead>
      <tr><th>Tâche</th><th>Total</th><th>Échecs</th><th>Conformité</th></tr>
    </thead>
    <tbody>
      ${tasksHtml}
    </tbody>
  </table>
</div>
<div class="footer">
  Généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} — <span class="logo">Taskmaster</span>
</div>
</body>
</html>`;
  }
}
