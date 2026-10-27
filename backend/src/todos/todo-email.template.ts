import {
  ACCENT,
  FONT,
  HEADER_BG,
  escapeHtml,
} from '../users/credentials-email.template';

export type TodoEmailReason = 'ASSIGNED' | 'CREATED';

export interface TodoEmailData {
  reason: TodoEmailReason;
  /** Who the mail is for. */
  name: string;
  /** Who created or assigned the todo. */
  actor: string;
  title: string;
  description?: string | null;
  /** Already formatted, e.g. `27/10/2026 14:30`. */
  due?: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  groupName?: string | null;
  appTitle: string;
  /** Absolute URL of the todolist, used for the button. */
  todosUrl?: string;
  logoUrl?: string;
}

const COPY = {
  ASSIGNED: {
    subject: 'Une tâche vous a été confiée / A task was assigned to you',
    titleFr: 'Une tâche vous attend',
    titleEn: 'A task is waiting for you',
    fr: (actor: string) => `${actor} vous a confié une nouvelle tâche.`,
    en: (actor: string) => `${actor} assigned you a new task.`,
  },
  CREATED: {
    subject: 'Nouvelle tâche collective / New shared task',
    titleFr: 'Nouvelle tâche collective',
    titleEn: 'New shared task',
    fr: (actor: string) =>
      `${actor} a ajouté une tâche à la liste de votre équipe.`,
    en: (actor: string) => `${actor} added a task to your team's list.`,
  },
} as const;

const PRIORITY = {
  LOW: { fr: 'Basse', en: 'Low', color: '#64748b', bg: '#f1f5f9' },
  NORMAL: { fr: 'Normale', en: 'Normal', color: '#1d4ed8', bg: '#dbeafe' },
  HIGH: { fr: 'Haute', en: 'High', color: '#b45309', bg: '#fef3c7' },
  URGENT: { fr: 'Urgente', en: 'Urgent', color: '#b91c1c', bg: '#fee2e2' },
} as const;

/** `2026-10-27` + `14:30` -> `27/10/2026 14:30`; the date is stored as a plain day. */
export function formatTodoDue(
  dueDate: Date | null | undefined,
  dueTime: string | null | undefined,
): string | null {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}${dueTime ? ` ${dueTime}` : ''}`;
}

export function renderTodoEmail(data: TodoEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = COPY[data.reason];
  const priority = PRIORITY[data.priority];
  const name = escapeHtml(data.name);
  const title = escapeHtml(data.title);
  const appTitle = escapeHtml(data.appTitle);
  const actor = escapeHtml(data.actor);
  const todosUrl = data.todosUrl ? escapeHtml(data.todosUrl) : '';

  const brand = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${appTitle}" height="40" style="display:block;margin:0 auto;border:0;max-height:40px;width:auto;" />`
    : `<span style="font-size:22px;font-weight:700;letter-spacing:.3px;color:#ffffff;">${appTitle}</span>`;

  const label = (text: string) =>
    `<tr><td style="padding:14px 20px 4px 20px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${text}</td></tr>`;
  const divider = `<tr><td style="padding:0 20px;"><div style="height:1px;background:#e2e8f0;line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;

  const rows = [
    `<tr><td style="padding:18px 20px 4px 20px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Tâche / Task</td></tr>
     <tr><td style="padding:0 20px 14px 20px;font-size:18px;font-weight:700;color:#0f172a;">${title}</td></tr>`,
    data.description
      ? `${divider}${label('Notes')}
     <tr><td style="padding:0 20px 14px 20px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-line;">${escapeHtml(data.description)}</td></tr>`
      : '',
    `${divider}${label('Priorité / Priority')}
     <tr><td style="padding:0 20px 14px 20px;"><span style="display:inline-block;font-size:13px;font-weight:600;color:${priority.color};background:${priority.bg};border-radius:999px;padding:4px 12px;">${priority.fr} / ${priority.en}</span></td></tr>`,
    data.due
      ? `${divider}${label('Échéance / Due')}
     <tr><td style="padding:0 20px 14px 20px;font-size:16px;font-weight:600;color:#0f172a;">${escapeHtml(data.due)}</td></tr>`
      : '',
    data.groupName
      ? `${divider}${label('Équipe / Team')}
     <tr><td style="padding:0 20px 14px 20px;font-size:15px;color:#0f172a;">${escapeHtml(data.groupName)}</td></tr>`
      : '',
  ].join('');

  const button = todosUrl
    ? `<tr><td align="center" style="padding:8px 32px 28px 32px;">
        <a href="${todosUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:8px;">Ouvrir la tâche &nbsp;/&nbsp; Open task</a>
      </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${appTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(data.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};color:#1e293b;">
      <tr><td align="center" style="background:${HEADER_BG};padding:26px 24px;">${brand}</td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:0;background:${ACCENT};">&nbsp;</td></tr>

      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.3;color:#0f172a;">${copy.titleFr}, ${name}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${copy.fr(actor)}</p>
      </td></tr>

      <tr><td style="padding:20px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          ${rows}
        </table>
      </td></tr>

      ${button}

      <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #e2e8f0;">
        <p style="margin:18px 0 4px 0;font-size:16px;font-weight:600;color:#0f172a;">${copy.titleEn}, ${name}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">${copy.en(actor)}</p>
      </td></tr>

      <tr><td align="center" style="background:#f8fafc;padding:16px 24px;font-size:12px;color:#94a3b8;">
        ${appTitle} &middot; Message automatique, merci de ne pas répondre / Automated message, please do not reply
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text =
    `${copy.titleFr}, ${data.name}\n${copy.fr(data.actor)}\n\n` +
    `Tâche : ${data.title}\n` +
    (data.description ? `Notes : ${data.description}\n` : '') +
    `Priorité : ${priority.fr}\n` +
    (data.due ? `Échéance : ${data.due}\n` : '') +
    (data.groupName ? `Équipe : ${data.groupName}\n` : '') +
    (data.todosUrl ? `\nOuvrir : ${data.todosUrl}\n` : '') +
    `\n${copy.titleEn}, ${data.name}\n${copy.en(data.actor)}\n`;

  return { subject: copy.subject, html, text };
}
