export type CredentialsEmailReason = 'CREATED' | 'RESET';

export interface CredentialsEmailData {
  reason: CredentialsEmailReason;
  name: string;
  login: string;
  password: string;
  appTitle: string;
  /** Absolute https/http URL of the app, used for the sign-in button. */
  loginUrl?: string;
  /** Absolute URL of the logo; omitted when it cannot be reached from outside. */
  logoUrl?: string;
}

const COPY = {
  CREATED: {
    subject: 'Votre compte est prêt / Your account is ready',
    titleFr: 'Bienvenue',
    titleEn: 'Welcome',
    fr: "Un compte vient d'être créé pour vous.",
    en: 'An account has been created for you.',
  },
  RESET: {
    subject: 'Mot de passe réinitialisé / Password reset',
    titleFr: 'Mot de passe réinitialisé',
    titleEn: 'Password reset',
    fr: 'Votre mot de passe a été réinitialisé par un administrateur.',
    en: 'Your password has been reset by an administrator.',
  },
} as const;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const ACCENT = '#2563eb';
export const HEADER_BG = '#0f172a';
export const FONT =
  "-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Resolves the stored logo setting to a URL a mail client can fetch, or null. */
export function resolveEmailLogoUrl(
  logo: string | null | undefined,
  baseUrl: string,
): string | null {
  const value = (logo ?? '').trim();
  if (!value || value.startsWith('data:')) return null;
  try {
    const url = new URL(value, baseUrl || undefined);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // A loopback/private host cannot be loaded by the recipient's mail client.
    if (/^(localhost|127\.|\[?::1\]?$)/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function renderCredentialsEmail(data: CredentialsEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = COPY[data.reason];
  const name = escapeHtml(data.name);
  const login = escapeHtml(data.login);
  const password = escapeHtml(data.password);
  const appTitle = escapeHtml(data.appTitle);
  const loginUrl = data.loginUrl ? escapeHtml(data.loginUrl) : '';

  const brand = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${appTitle}" height="40" style="display:block;margin:0 auto;border:0;max-height:40px;width:auto;" />`
    : `<span style="font-size:22px;font-weight:700;letter-spacing:.3px;color:#ffffff;">${appTitle}</span>`;

  const button = loginUrl
    ? `<tr><td align="center" style="padding:8px 32px 28px 32px;">
        <a href="${loginUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:8px;">Se connecter &nbsp;/&nbsp; Sign in</a>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};color:#1e293b;">
      <tr><td align="center" style="background:${HEADER_BG};padding:26px 24px;">${brand}</td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:0;background:${ACCENT};">&nbsp;</td></tr>

      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.3;color:#0f172a;">${copy.titleFr}, ${name}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${copy.fr}</p>
      </td></tr>

      <tr><td style="padding:20px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:18px 20px 6px 20px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Identifiant / Login</td></tr>
          <tr><td style="padding:0 20px 14px 20px;font-size:16px;font-weight:600;color:#0f172a;word-break:break-all;">${login}</td></tr>
          <tr><td style="padding:0 20px;"><div style="height:1px;background:#e2e8f0;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
          <tr><td style="padding:14px 20px 6px 20px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Mot de passe temporaire / Temporary password</td></tr>
          <tr><td style="padding:0 20px 18px 20px;"><span style="display:inline-block;font-family:Consolas,'Courier New',monospace;font-size:19px;font-weight:700;letter-spacing:1px;color:#0f172a;background:#ffffff;border:1px dashed #94a3b8;border-radius:6px;padding:8px 12px;word-break:break-all;">${password}</span></td></tr>
        </table>
      </td></tr>

      ${button}

      <tr><td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
          <tr><td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#92400e;">
            <strong>Sécurité :</strong> vous devrez choisir un nouveau mot de passe à la prochaine connexion. Ne transmettez ce message à personne.<br />
            <strong>Security:</strong> you will be asked to choose a new password at next sign-in. Do not forward this message.
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #e2e8f0;">
        <p style="margin:18px 0 4px 0;font-size:16px;font-weight:600;color:#0f172a;">${copy.titleEn}, ${name}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">${copy.en}</p>
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
    `${copy.titleFr}, ${data.name}\n${copy.fr}\n\n` +
    `Identifiant : ${data.login}\nMot de passe temporaire : ${data.password}\n` +
    (data.loginUrl ? `Connexion : ${data.loginUrl}\n` : '') +
    `Vous devrez choisir un nouveau mot de passe à la prochaine connexion.\n\n` +
    `${copy.titleEn}, ${data.name}\n${copy.en}\n` +
    `Login: ${data.login}\nTemporary password: ${data.password}\n` +
    `You will be asked to choose a new password at next sign-in.`;

  return { subject: copy.subject, html, text };
}
