import {
  ACCENT,
  FONT,
  HEADER_BG,
  escapeHtml,
} from '../users/credentials-email.template';

export type TaskNotificationEvent = 'FAILED' | 'OVERDUE' | 'REMINDER';

export interface TaskNotificationEmailData {
  event: TaskNotificationEvent;
  taskName: string;
  /** Labelled facts; a `Lien` line with an http(s) URL becomes the button. */
  details: { label: string; value: string }[];
  appTitle: string;
  logoUrl?: string | null;
}

const LINK_LABEL = 'Lien';
const TASK_LABEL = 'Tâche';

const EVENTS: Record<
  TaskNotificationEvent,
  { badge: string; title: string; lead: string; color: string; bg: string }
> = {
  FAILED: {
    badge: 'Échec',
    title: 'Une tâche a échoué',
    lead: 'Cette occurrence a été signalée en échec.',
    color: '#b91c1c',
    bg: '#fee2e2',
  },
  OVERDUE: {
    badge: 'Tâche manquée',
    title: "Une tâche n'a pas été réalisée",
    lead: "Cette occurrence n'a pas été validée avant son échéance.",
    color: '#b45309',
    bg: '#fef3c7',
  },
  REMINDER: {
    badge: 'Rappel',
    title: 'Une tâche arrive à échéance',
    lead: 'Pensez à la valider avant la fin de sa période.',
    color: '#1d4ed8',
    bg: '#dbeafe',
  },
};

/** Tables and inline styles only: Outlook and most helpdesk tools ignore anything else. */
export function renderTaskNotificationEmail(
  data: TaskNotificationEmailData,
): string {
  const event = EVENTS[data.event];
  const appTitle = escapeHtml(data.appTitle);
  const taskName = escapeHtml(data.taskName);

  const link = data.details.find(
    (line) => line.label === LINK_LABEL && /^https?:\/\//.test(line.value),
  )?.value;
  const url = link ? escapeHtml(link) : '';

  const rows = data.details
    .filter((line) => line.label !== TASK_LABEL && line.value !== link)
    .map(
      (line) =>
        `<tr>
          <td valign="top" style="padding:10px 16px 10px 20px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;white-space:nowrap;">${escapeHtml(line.label)}</td>
          <td style="padding:10px 20px 10px 0;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.5;color:#0f172a;">${escapeHtml(line.value).replace(/\n/g, '<br>')}</td>
        </tr>`,
    )
    .join('');

  const brand = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${appTitle}" height="36" style="display:block;margin:0 auto;border:0;max-height:36px;width:auto;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:.3px;color:#ffffff;">${appTitle}</span>`;

  const button = url
    ? `<tr><td align="center" style="padding:4px 32px 26px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:8px;">
            <a href="${url}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Ouvrir la tâche</a>
          </td>
        </tr></table>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${appTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${event.badge} : ${taskName}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};color:#1e293b;">
      <tr><td align="center" bgcolor="${HEADER_BG}" style="background:${HEADER_BG};padding:22px 24px;">${brand}</td></tr>
      <tr><td bgcolor="${event.color}" style="height:4px;line-height:4px;font-size:0;background:${event.color};">&nbsp;</td></tr>

      <tr><td style="padding:30px 32px 6px 32px;">
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;color:${event.color};background:${event.bg};">${event.badge}</span>
        <h1 style="margin:14px 0 8px 0;font-size:22px;line-height:1.3;color:#0f172a;">${event.title}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${event.lead}</p>
      </td></tr>

      <tr><td style="padding:18px 32px 22px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td colspan="2" style="padding:16px 20px;font-size:17px;font-weight:700;color:#0f172a;">${taskName}</td></tr>
          ${rows}
        </table>
      </td></tr>

      ${button}

      <tr><td align="center" bgcolor="#f8fafc" style="background:#f8fafc;padding:16px 24px;font-size:12px;color:#94a3b8;">
        ${appTitle} &middot; Message automatique, merci de ne pas répondre
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
