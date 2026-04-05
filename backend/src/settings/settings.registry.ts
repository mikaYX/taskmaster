import { z } from 'zod';

/**
 * Settings Key Registry.
 *
 * Defines all allowed settings keys with:
 * - Zod validation schema
 * - Whether the value is sensitive (encrypted at rest, not returned)
 * - Default value
 * - Description
 */
export const SETTINGS_REGISTRY = {
  // === Email Settings ===
  'email.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable email notifications',
  },
  'email.smtp.host': {
    schema: z.string().min(1),
    sensitive: false,
    default: '',
    description: 'SMTP server hostname',
  },
  'email.smtp.port': {
    schema: z.number().int().min(1).max(65535),
    sensitive: false,
    default: 587,
    description: 'SMTP server port',
  },
  'email.smtp.user': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'SMTP username',
  },
  'email.smtp.password': {
    schema: z.string(),
    sensitive: true, // ENCRYPTED
    default: '',
    description: 'SMTP password (encrypted)',
  },
  'email.from': {
    schema: z.string().email().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'From email address',
  },
  'email.recipients': {
    schema: z.array(z.string().email()),
    sensitive: false,
    default: [],
    description: 'Default recipient list',
  },
  'email.provider': {
    schema: z.enum(['smtp', 'mailgun', 'mailjet', 'sendgrid']),
    sensitive: false,
    default: 'smtp',
    description: 'Email provider to use',
  },
  'email.mailgun.apiKey': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'Mailgun API key (encrypted)',
  },
  'email.mailgun.domain': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'Mailgun domain',
  },
  'email.mailjet.apiKey': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'Mailjet API key (encrypted)',
  },
  'email.mailjet.secretKey': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'Mailjet secret key (encrypted)',
  },
  'email.sendgrid.apiKey': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'SendGrid API key (encrypted)',
  },

  // === Auth Settings ===
  'auth.mfa.required': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Require MFA for all users',
  },
  'auth.mfa.methods': {
    schema: z.string(),
    sensitive: false,
    default: 'authenticator',
    description: 'Allowed MFA methods',
  },
  'auth.passkeys.enabled': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enable Passkeys',
  },
  'auth.requirements.admin.mfa': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Require MFA for administrators',
  },
  'auth.requirements.admin.passkeys': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Require Passkeys for administrators',
  },
  'auth.requirements.user.mfa': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Require MFA for users',
  },
  'auth.requirements.user.passkeys': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Require Passkeys for users',
  },

  // === Security Enforcement Settings (SecuritySettingsPage) ===
  'security.enforcement.mfa.admin': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce MFA for administrators',
  },
  'security.enforcement.mfa.manager': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce MFA for managers',
  },
  'security.enforcement.mfa.user': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce MFA for standard users',
  },
  'security.enforcement.passkeys.admin': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce Passkeys for administrators',
  },
  'security.enforcement.passkeys.manager': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce Passkeys for managers',
  },
  'security.enforcement.passkeys.user': {
    schema: z.string(),
    sensitive: false,
    default: 'false',
    description: 'Enforce Passkeys for standard users',
  },

  'auth.session.timeout': {
    schema: z.string(),
    sensitive: false,
    default: '30',
    description: 'Session timeout in minutes',
  },
  'auth.session.secureActions': {
    schema: z.string(),
    sensitive: false,
    default: 'true',
    description: 'Require login for sensitive actions',
  },
  'auth.azureAd.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable Azure AD authentication',
  },
  'auth.azureAd.tenantId': {
    schema: z.string().uuid().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'Azure AD Tenant ID',
  },
  'auth.azureAd.clientId': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'Azure AD Client ID',
  },
  'auth.azureAd.clientSecret': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'Azure AD Client Secret (encrypted)',
  },
  'auth.ldap.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable LDAP authentication',
  },
  'auth.ldap.url': {
    schema: z.string().url().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'LDAP Server URL',
  },
  'auth.ldap.bindDn': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'LDAP Bind DN',
  },
  'auth.ldap.bindPassword': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'LDAP Bind Password (encrypted)',
  },
  'auth.ldap.searchBase': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'LDAP Search Base',
  },
  'auth.ldap.searchFilter': {
    schema: z.string().refine((val) => val.includes('{{usermail}}'), {
      message: "Filter must contain '{{usermail}}' placeholder",
    }),
    sensitive: false,
    default: '(mail={{usermail}})',
    description: 'LDAP Search Filter (must contain {{usermail}})',
  },

  // --- Google Workspace ---
  'auth.google.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable Google Workspace authentication',
  },
  'auth.google.clientId': {
    schema: z.string(),
    sensitive: false,
    default: '',
    description: 'Google Client ID',
  },
  'auth.google.clientSecret': {
    schema: z.string(),
    sensitive: true,
    default: '',
    description: 'Google Client Secret (encrypted)',
  },
  'auth.google.hostedDomain': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'Google Hosted Domain (optional restriction)',
  },

  // --- Generic OIDC / SAML ---
  'auth.generic.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable Generic OIDC/SAML authentication',
  },
  'auth.generic.type': {
    schema: z.enum(['oidc', 'saml']),
    sensitive: false,
    default: 'oidc',
    description: 'Generic Provider Type',
  },
  // OIDC
  'auth.generic.oidc.issuer': {
    schema: z.string().url().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'OIDC Issuer URL',
  },
  'auth.generic.oidc.clientId': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'OIDC Client ID',
  },
  'auth.generic.oidc.clientSecret': {
    schema: z.string().or(z.literal('')),
    sensitive: true,
    default: '',
    description: 'OIDC Client Secret (encrypted)',
  },
  'auth.generic.oidc.scopes': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: 'openid profile email',
    description: 'OIDC Scopes (space separated)',
  },
  'auth.generic.oidc.providerName': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'OIDC Provider display name (shown on login button)',
  },
  // SAML
  'auth.generic.saml.entityId': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'SAML Entity ID (Issuer)',
  },
  'auth.generic.saml.ssoUrl': {
    schema: z.string().url().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'SAML Single Sign-On URL',
  },
  'auth.generic.saml.x509': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'SAML X.509 Certificate',
  },
  'auth.generic.saml.metadataUrl': {
    schema: z.string().url().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'SAML Metadata URL (optional)',
  },

  // === Email Alerts & Reminders ===
  'email.alerts.missingTasks': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable missing tasks alerts',
  },
  'email.alerts.recipients': {
    schema: z.array(z.string()),
    sensitive: false,
    default: ['admin'],
    description: 'Missing tasks alert recipients',
  },
  'email.alerts.customEmails': {
    schema: z.array(z.string().email()),
    sensitive: false,
    default: [],
    description: 'Custom email recipients for alerts',
  },
  'email.reminders.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable task reminders',
  },
  'email.reminders.offsetHours': {
    schema: z.number().int().min(0).max(24),
    sensitive: false,
    default: 1,
    description: 'Reminder offset hours',
  },
  'email.reminders.offsetMinutes': {
    schema: z.number().int().min(0).max(59),
    sensitive: false,
    default: 0,
    description: 'Reminder offset minutes',
  },
  'email.reminders.recipients': {
    schema: z.array(z.string()),
    sensitive: false,
    default: ['assigned'],
    description: 'Task reminder recipients',
  },
  'email.reminders.customEmails': {
    schema: z.array(z.string().email()),
    sensitive: false,
    default: [],
    description: 'Custom email recipients for reminders',
  },

  // === Export Settings ===
  'export.autoExport.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable automatic exports',
  },
  'export.autoExport.scheduleType': {
    schema: z.enum(['daily', 'weekly', 'monthly', 'custom']),
    sensitive: false,
    default: 'daily',
    description: 'Auto-export schedule type',
  },
  'export.autoExport.dayOfWeek': {
    schema: z.number().int().min(0).max(6),
    sensitive: false,
    default: 1, // Monday
    description: 'Day of week for weekly export (0=Sunday)',
  },
  'export.autoExport.dayOfMonth': {
    schema: z.number().int().min(1).max(31),
    sensitive: false,
    default: 1,
    description: 'Day of month for monthly export',
  },
  'export.autoExport.monthMode': {
    schema: z.enum(['specific', 'last', 'relative']),
    sensitive: false,
    default: 'specific',
    description: 'Monthly export mode',
  },
  'export.autoExport.weekOrdinal': {
    schema: z.enum(['first', 'second', 'third', 'fourth', 'last']),
    sensitive: false,
    default: 'first',
    description: 'Week ordinal for relative monthly export',
  },
  'export.autoExport.cron': {
    schema: z.string(),
    sensitive: false,
    default: '0 0 * * *',
    description: 'Auto-export cron schedule (Custom)',
  },
  'export.autoExport.formats': {
    schema: z.array(z.enum(['csv', 'pdf'])),
    sensitive: false,
    default: ['csv'],
    description: 'Auto-export formats',
  },
  'export.autoExport.email.enabled': {
    schema: z.boolean(),
    sensitive: false,
    default: false,
    description: 'Enable export by email',
  },
  'export.autoExport.email.formats': {
    schema: z.array(z.enum(['csv', 'pdf'])),
    sensitive: false,
    default: ['csv'],
    description: 'Formatted files to attach in email',
  },
  'export.autoExport.email.recipients': {
    schema: z.array(z.string()),
    sensitive: false,
    default: ['admin'],
    description: 'Export email recipients',
  },
  'export.autoExport.email.customEmails': {
    schema: z.array(z.string().email()),
    sensitive: false,
    default: [],
    description: 'Custom email recipients for export',
  },
  'export.path': {
    schema: z.string(),
    sensitive: false,
    default: './exports',
    description: 'Export directory path',
  },
  'export.offset.from': {
    schema: z.number().int(),
    sensitive: false,
    default: 30,
    description: 'Export data range start (days ago)',
  },
  'export.offset.to': {
    schema: z.number().int(),
    sensitive: false,
    default: 0,
    description: 'Export data range end (days ago)',
  },
  'export.retention.days': {
    schema: z.number().int().min(0).max(3650),
    sensitive: false,
    default: 30, // 0 = Never
    description: 'Export file retention in days (0=Never)',
  },

  // === Backup Settings ===
  'backup.enabled': {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: false,
    description: 'Enable automatic backups',
  },
  'backup.scheduleType': {
    schema: z.enum(['daily', 'weekly', 'custom']),
    sensitive: false,
    default: 'daily',
    description: 'Backup frequency type',
  },
  'backup.dayOfWeek': {
    schema: z.number().int().min(0).max(6), // 0=Sunday
    sensitive: false,
    default: 1,
    description: 'Day of week for weekly backup',
  },
  'backup.cron': {
    schema: z.string(),
    sensitive: false,
    default: '0 3 * * *',
    description: 'Auto-backup cron schedule',
  },
  'backup.time': {
    schema: z.string(),
    sensitive: false,
    default: '03:00',
    description: 'Backup time (HH:mm)',
  },
  'backup.type': {
    schema: z.enum(['json', 'zip']),
    sensitive: false,
    default: 'json',
    description: 'Backup type (JSON only or Full ZIP)',
  },
  'backup.encryption.password': {
    schema: z.string().or(z.literal('')),
    sensitive: true, // Encrypted
    default: '',
    description: 'Backup encryption password',
  },
  'backup.retention.count': {
    schema: z.number().int().min(1).max(100),
    sensitive: false,
    default: 10,
    description: 'Number of backups to keep (Retention Count)',
  },
  'backup.path': {
    schema: z.string(),
    sensitive: false,
    default: './backups',
    description: 'Backup storage path (Read-only in UI)',
  },

  // === App Settings ===
  'app.title': {
    schema: z.string().max(50),
    sensitive: false,
    default: 'Taskmaster',
    description: 'Application title',
  },
  'app.subtitle': {
    schema: z.string().max(100),
    sensitive: false,
    default: 'Task Management System',
    description: 'Application subtitle',
  },
  'app.showTitle': {
    schema: z.string(), // Frontend sends "true" / "false" as strings
    sensitive: false,
    default: 'true',
    description: 'Show application title in sidebar',
  },
  'app.showSubtitle': {
    schema: z.string(), // Frontend sends "true" / "false" as strings
    sensitive: false,
    default: 'true',
    description: 'Show application subtitle in sidebar',
  },
  'app.country': {
    schema: z.string().min(2),
    sensitive: false,
    default: 'FR',
    description: 'Application country (for holidays)',
  },
  'app.logoUrl': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'Application Logo URL',
  },
  'app.faviconUrl': {
    schema: z.string().or(z.literal('')),
    sensitive: false,
    default: '',
    description: 'Application Favicon URL',
  },

  // === UI Settings ===
  'ui.language': {
    schema: z.enum(['en', 'fr']),
    sensitive: false,
    default: 'fr',
    description: 'Default UI language',
  },
  'ui.theme': {
    schema: z.string(),
    sensitive: false,
    default: 'zinc',
    description: 'UI Theme color',
  },
  'ui.displayMode': {
    schema: z.enum(['light', 'dark', 'system']),
    sensitive: false,
    default: 'system',
    description: 'UI Display Mode',
  },
  'ui.dateFormat': {
    schema: z.string(),
    sensitive: false,
    default: 'DD/MM/YYYY',
    description: 'Date display format',
  },

  // === Scheduler Settings ===
  'scheduler.enabled': {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: true,
    description: 'Enable task scheduler',
  },
  'scheduler.timezone': {
    schema: z.string(),
    sensitive: false,
    default: 'Europe/Paris',
    description: 'Scheduler timezone',
  },
  SCHEDULE_DEFAULT_START_TIME: {
    schema: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Requires HH:mm format'),
    sensitive: false,
    default: '08:00',
    description: 'Global default start time for tasks (HH:mm)',
  },
  SCHEDULE_DEFAULT_END_TIME: {
    schema: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Requires HH:mm format'),
    sensitive: false,
    default: '18:00',
    description: 'Global default end time for tasks (HH:mm)',
  },
  FROM_COMPLETION_ENABLED: {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: true,
    description: 'Enable FROM_COMPLETION recurrence mode',
  },

  SCHEDULE_BULK_ENABLED: {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: false,
    description: 'Enable bulk schedule creation',
  },
  TASK_OCCURRENCE_OVERRIDES_ENABLED: {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: false,
    description: 'Enable single occurrence overrides (MOVE/SKIP)',
  },
  'addons.todolist.enabled': {
    schema: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean(),
    ),
    sensitive: false,
    default: true,
    description: 'Enable simple Todolist addon',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;
export const SETTING_KEYS = Object.keys(SETTINGS_REGISTRY) as SettingKey[];

/**
 * Check if a key is in the whitelist.
 */
export function isValidKey(key: string): key is SettingKey {
  return key in SETTINGS_REGISTRY;
}

/**
 * Check if a key is sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  return isValidKey(key) && SETTINGS_REGISTRY[key].sensitive;
}
