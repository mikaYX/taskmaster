import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AnalyticsService } from './analytics.service';
import type { OverviewResponse, TaskComplianceItem } from './dto';

interface PdfGenerationData {
  overview: OverviewResponse;
  tasks: TaskComplianceItem[];
  startDate: string;
  endDate: string;
}

const FONT_REGULAR = 'Body';
const FONT_BOLD = 'Body-Bold';
const PAGE_MARGIN = 40;
const FOOTER_HEIGHT = 36;
const ROW_HEIGHT = 26;

const COLORS = {
  ink: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  rowAlt: '#f8fafc',
  headerBg: '#1e40af',
  tableHead: '#0f172a',
  success: '#16a34a',
  failed: '#dc2626',
  missing: '#d97706',
  total: '#2563eb',
};

// DejaVu Sans is embedded so Latin, Greek and Cyrillic names render correctly.
// If the font files are missing, the built-in Helvetica (Windows-1252 only) is
// used instead. Whatever the active font cannot draw is replaced by "?".
const WIN_ANSI_EXTRA = new Set(
  [...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'].map((c) => c.codePointAt(0)!),
);

@Injectable()
export class AnalyticsPdfService {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async generate(startDate: string, endDate: string): Promise<Buffer> {
    const [overview, tasks] = await Promise.all([
      this.analyticsService.getOverview(startDate, endDate),
      this.analyticsService.getByTask(startDate, endDate, 9999),
    ]);

    return this.render({ overview, tasks, startDate, endDate });
  }

  private static readonly isWinAnsi = (code: number): boolean =>
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa1 && code <= 0xff) ||
    WIN_ANSI_EXTRA.has(code);

  /** Keeps only characters the active font can draw. */
  private safe(
    value: string,
    canDraw: (code: number) => boolean = AnalyticsPdfService.isWinAnsi,
  ): string {
    return [...value.replace(/[\s\u00a0\u202f]+/g, ' ')]
      .map((c) => (canDraw(c.codePointAt(0)!) ? c : '?'))
      .join('');
  }

  private loadFonts(): { regular: string; bold: string } | null {
    try {
      return {
        regular: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
        bold: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
      };
    } catch {
      return null;
    }
  }

  private rateColor(rate: number): string {
    return rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  }

  private badgeColors(rate: number): { bg: string; fg: string } {
    if (rate >= 90) return { bg: '#dcfce7', fg: COLORS.success };
    if (rate >= 70) return { bg: '#fff7ed', fg: COLORS.missing };
    return { bg: '#fef2f2', fg: COLORS.failed };
  }

  private render(data: PdfGenerationData): Promise<Buffer> {
    const { overview, tasks, startDate, endDate } = data;

    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: this.safe(`Rapport de conformité ${startDate} - ${endDate}`),
        Author: 'Taskmaster',
      },
    });

    const fonts = this.loadFonts();
    if (fonts) {
      doc.registerFont(FONT_REGULAR, fonts.regular);
      doc.registerFont(FONT_BOLD, fonts.bold);
    }
    const regular = fonts ? FONT_REGULAR : 'Helvetica';
    const bold = fonts ? FONT_BOLD : 'Helvetica-Bold';
    const face = (doc.font(regular) as any)._font?.font;
    const canDraw: (code: number) => boolean =
      fonts && typeof face?.hasGlyphForCodePoint === 'function'
        ? (code) => face.hasGlyphForCodePoint(code)
        : AnalyticsPdfService.isWinAnsi;
    const safe = (value: string) => this.safe(value, canDraw);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    // Header band
    doc.rect(0, 0, pageWidth, 130).fill(COLORS.headerBg);
    doc
      .fillColor('#ffffff')
      .font(bold)
      .fontSize(26)
      .text(safe('Rapport de Conformité'), PAGE_MARGIN, 38, {
        lineBreak: false,
      });
    doc
      .font(regular)
      .fontSize(11)
      .fillColor('#dbeafe')
      .text(safe('Analyse de performance des tâches'), PAGE_MARGIN, 72, {
        lineBreak: false,
      });
    const period = safe(`Période : ${startDate}  au  ${endDate}`);
    const periodWidth = doc.font(bold).fontSize(10).widthOfString(period);
    doc
      .roundedRect(PAGE_MARGIN, 94, periodWidth + 28, 22, 11)
      .fillAndStroke('#3b6fd8', '#6b93e6');
    doc
      .fillColor('#ffffff')
      .text(period, PAGE_MARGIN + 14, 100, { lineBreak: false });

    // KPI cards
    const kpis = [
      { label: 'SUCCÈS', value: overview.success, color: COLORS.success },
      { label: 'ÉCHECS', value: overview.failed, color: COLORS.failed },
      { label: 'MANQUANTS', value: overview.missing, color: COLORS.missing },
      { label: 'TOTAL', value: overview.total, color: COLORS.total },
    ];
    const gap = 12;
    const cardWidth = (contentWidth - gap * (kpis.length - 1)) / kpis.length;
    const cardTop = 156;
    kpis.forEach((kpi, i) => {
      const x = PAGE_MARGIN + i * (cardWidth + gap);
      doc
        .roundedRect(x, cardTop, cardWidth, 74, 8)
        .fillAndStroke(COLORS.rowAlt, COLORS.line);
      doc.rect(x + 1, cardTop + 1, cardWidth - 2, 3).fill(kpi.color);
      doc
        .fillColor(kpi.color)
        .font(bold)
        .fontSize(26)
        .text(String(kpi.value), x, cardTop + 18, {
          width: cardWidth,
          align: 'center',
          lineBreak: false,
        });
      doc
        .fillColor(COLORS.muted)
        .font(bold)
        .fontSize(8)
        .text(safe(kpi.label), x, cardTop + 54, {
          width: cardWidth,
          align: 'center',
          lineBreak: false,
        });
    });

    // Global compliance
    const rate = overview.complianceRate;
    const rateColor = this.rateColor(rate);
    const secTop = cardTop + 74 + 22;
    doc
      .roundedRect(PAGE_MARGIN, secTop, contentWidth, 104, 10)
      .fillAndStroke('#f0f9ff', '#e0f2fe');
    doc
      .fillColor(COLORS.muted)
      .font(bold)
      .fontSize(9)
      .text(safe('TAUX DE CONFORMITÉ GLOBAL'), PAGE_MARGIN, secTop + 14, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
        characterSpacing: 1,
      });
    doc
      .fillColor(rateColor)
      .fontSize(40)
      .text(`${rate.toFixed(1)}%`, PAGE_MARGIN, secTop + 32, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });
    const barWidth = Math.min(280, contentWidth - 40);
    const barX = PAGE_MARGIN + (contentWidth - barWidth) / 2;
    const barY = secTop + 84;
    doc.roundedRect(barX, barY, barWidth, 7, 3.5).fill(COLORS.line);
    const filled = (barWidth * Math.max(0, Math.min(rate, 100))) / 100;
    if (filled > 0) {
      doc.roundedRect(barX, barY, Math.max(filled, 7), 7, 3.5).fill(rateColor);
    }

    // Per-task table
    let y = secTop + 104 + 28;
    doc.rect(PAGE_MARGIN, y, 4, 20).fill(COLORS.total);
    doc
      .fillColor(COLORS.ink)
      .font(bold)
      .fontSize(14)
      .text(safe('Conformité par tâche'), PAGE_MARGIN + 12, y + 3, {
        lineBreak: false,
      });
    y += 34;

    const cols = {
      name: { x: PAGE_MARGIN + 12, w: contentWidth - 12 - 70 - 70 - 90 - 12 },
      total: { x: 0, w: 70 },
      failed: { x: 0, w: 70 },
      rate: { x: 0, w: 90 },
    };
    cols.total.x = cols.name.x + cols.name.w;
    cols.failed.x = cols.total.x + cols.total.w;
    cols.rate.x = cols.failed.x + cols.failed.w;

    const drawTableHead = (top: number): number => {
      doc.rect(PAGE_MARGIN, top, contentWidth, 26).fill(COLORS.tableHead);
      doc.fillColor('#ffffff').font(bold).fontSize(8);
      doc.text(safe('TÂCHE'), cols.name.x, top + 9, { lineBreak: false });
      doc.text('TOTAL', cols.total.x, top + 9, {
        width: cols.total.w,
        align: 'center',
        lineBreak: false,
      });
      doc.text(safe('ÉCHECS'), cols.failed.x, top + 9, {
        width: cols.failed.w,
        align: 'center',
        lineBreak: false,
      });
      doc.text(safe('CONFORMITÉ'), cols.rate.x, top + 9, {
        width: cols.rate.w,
        align: 'right',
        lineBreak: false,
      });
      return top + 26;
    };

    const bottomLimit = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
    y = drawTableHead(y);

    if (tasks.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font(regular)
        .fontSize(10)
        .text(safe('Aucune tâche sur cette période'), PAGE_MARGIN, y + 18, {
          width: contentWidth,
          align: 'center',
          lineBreak: false,
        });
    }

    tasks.forEach((task, index) => {
      if (y + ROW_HEIGHT > bottomLimit) {
        doc.addPage();
        y = drawTableHead(PAGE_MARGIN);
      }
      if (index % 2 === 1) {
        doc.rect(PAGE_MARGIN, y, contentWidth, ROW_HEIGHT).fill(COLORS.rowAlt);
      }
      doc
        .moveTo(PAGE_MARGIN, y + ROW_HEIGHT)
        .lineTo(PAGE_MARGIN + contentWidth, y + ROW_HEIGHT)
        .lineWidth(0.5)
        .strokeColor('#f1f5f9')
        .stroke();

      doc
        .fillColor(COLORS.text)
        .font(regular)
        .fontSize(9.5)
        .text(safe(task.taskName), cols.name.x, y + 8, {
          width: cols.name.w - 8,
          height: 12,
          ellipsis: true,
          lineBreak: false,
        });
      doc.text(String(task.total), cols.total.x, y + 8, {
        width: cols.total.w,
        align: 'center',
        lineBreak: false,
      });
      doc
        .fillColor(task.failed > 0 ? COLORS.failed : COLORS.text)
        .font(task.failed > 0 ? bold : regular)
        .text(String(task.failed), cols.failed.x, y + 8, {
          width: cols.failed.w,
          align: 'center',
          lineBreak: false,
        });

      const label = `${task.complianceRate.toFixed(1)}%`;
      const colors = this.badgeColors(task.complianceRate);
      doc.font(bold).fontSize(8.5);
      const badgeW = doc.widthOfString(label) + 20;
      const badgeX = cols.rate.x + cols.rate.w - badgeW;
      doc.roundedRect(badgeX, y + 5, badgeW, 16, 8).fill(colors.bg);
      doc.fillColor(colors.fg).text(label, badgeX, y + 9.5, {
        width: badgeW,
        align: 'center',
        lineBreak: false,
      });

      y += ROW_HEIGHT;
    });

    // Footer + page numbers on every page
    const generatedAt = safe(
      new Date().toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      }),
    );
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - PAGE_MARGIN - 10;
      // Drawing below the bottom margin would otherwise trigger a new page.
      doc.page.margins.bottom = 0;
      doc
        .fillColor(COLORS.faint)
        .font(regular)
        .fontSize(8)
        .text(
          safe(`Généré le ${generatedAt} - Taskmaster`),
          PAGE_MARGIN,
          footerY,
          { width: contentWidth - 60, lineBreak: false },
        );
      doc.text(
        `${i - range.start + 1} / ${range.count}`,
        PAGE_MARGIN + contentWidth - 60,
        footerY,
        { width: 60, align: 'right', lineBreak: false },
      );
    }

    doc.end();
    return done;
  }
}
