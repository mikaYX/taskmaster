import { z } from 'zod';
import i18n from '@/lib/i18n';

export const generalSettingsSchema = z.object({
    lang: z.enum(['en', 'fr']),
    country: z.string().min(2, i18n.t('settingsValidation.countryRequired')),
    displayMode: z.enum(['light', 'dark', 'system']),
    theme: z.string().optional(),
    title: z.string().max(50, i18n.t('settingsValidation.titleMax')).optional(),
    subtitle: z.string().max(100, i18n.t('settingsValidation.subtitleMax')).optional(),
});

export const authSettingsSchema = z.object({
    mfa: z.object({
        required: z.boolean(),
        methods: z.array(z.string()),
    }).optional(),
    passkeys: z.object({
        enabled: z.boolean(),
    }).optional(),
    requirements: z.object({
        admin: z.object({
            mfa: z.boolean(),
            passkeys: z.boolean(),
        }),
        user: z.object({
            mfa: z.boolean(),
            passkeys: z.boolean(),
        }),
    }).optional(),
    session: z.object({
        timeout: z.number().int().min(1),
        secureActions: z.boolean(),
    }).optional(),
    azureAd: z.object({
        enabled: z.boolean(),
        tenantId: z.string().uuid(i18n.t('settingsValidation.invalidTenantIdFormat')).optional().or(z.literal('')),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
    }),
    google: z.object({
        enabled: z.boolean(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        hostedDomain: z.string().optional(),
    }),
    generic: z.object({
        enabled: z.boolean(),
        type: z.enum(['oidc', 'saml']),
        oidc: z.object({
            issuer: z.string().url().optional().or(z.literal('')),
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
            scopes: z.string().optional(),
            providerName: z.string().optional(),
        }),
        saml: z.object({
            entityId: z.string().optional(),
            ssoUrl: z.string().url().optional().or(z.literal('')),
            x509: z.string().optional(),
            metadataUrl: z.string().url().optional().or(z.literal('')),
        }),
    }),
    ldap: z.object({
        enabled: z.boolean(),
        url: z.string().url(i18n.t('settingsValidation.invalidLdapUrl')).optional().or(z.literal('')),
        bindDn: z.string().optional(),
        bindPassword: z.string().optional(),
        searchBase: z.string().optional(),
        searchFilter: z.string().refine(val => !val || val.includes('{{usermail}}'), {
            message: i18n.t('settingsValidation.usermailPlaceholder')
        }).optional(),
    }),
});

export const emailSettingsSchema = z.object({
    enabled: z.boolean(),
    provider: z.enum(['smtp', 'mailgun', 'mailjet', 'sendgrid']),
    smtp: z.object({
        host: z.string().min(1, i18n.t('settingsValidation.hostRequired')).optional().or(z.literal('')),
        port: z.number().int().positive().optional(),
        user: z.string().optional(),
        pass: z.string().optional(),
        from: z.string().email(i18n.t('settingsValidation.invalidEmailAddress')).optional().or(z.literal('')),
        secure: z.boolean(),
    }).optional(),
    mailgun: z.object({
        apiKey: z.string().optional(),
        domain: z.string().optional(),
        region: z.string().optional(),
        from: z.string().email(i18n.t('settingsValidation.invalidEmailAddress')).optional().or(z.literal('')),
    }).optional(),
    mailjet: z.object({
        apiKey: z.string().optional(),
        secretKey: z.string().optional(),
        from: z.string().email(i18n.t('settingsValidation.invalidEmailAddress')).optional().or(z.literal('')),
    }).optional(),
    sendgrid: z.object({
        apiKey: z.string().optional(),
        from: z.string().email(i18n.t('settingsValidation.invalidEmailAddress')).optional().or(z.literal('')),
    }).optional(),
    alerts: z.object({
        missingTasks: z.boolean(),
        recipients: z.array(z.string()),
        customEmails: z.array(z.string().email()),
    }),
    reminders: z.object({
        enabled: z.boolean(),
        offsetHours: z.number().min(0).max(24),
        offsetMinutes: z.number().min(0).max(59),
        recipients: z.array(z.string()),
        customEmails: z.array(z.string().email()),
    }),
});

export const exportSettingsSchema = z.object({
    autoExport: z.object({
        enabled: z.boolean(),
        scheduleType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
        dayOfWeek: z.number().min(0).max(6), // 0=Sunday
        dayOfMonth: z.number().min(1).max(31),
        monthMode: z.enum(['specific', 'last', 'relative']),
        weekOrdinal: z.enum(['first', 'second', 'third', 'fourth', 'last']).optional(),
        cron: z.string(), // used if scheduleType === 'custom'
        formats: z.array(z.enum(['csv', 'pdf'])),
        email: z.object({
            enabled: z.boolean(),
            formats: z.array(z.enum(['csv', 'pdf'])),
            recipients: z.array(z.string()),
            customEmails: z.array(z.string().email()),
        }),
    }),
    config: z.object({
        path: z.string(),
        offsetFrom: z.number(), // days ago
        offsetTo: z.number(), // days ago
    }),
    retention: z.object({
        days: z.number().min(0),
    }),
});

export const backupSettingsSchema = z.object({
    enabled: z.boolean(),
    scheduleType: z.enum(['daily', 'weekly', 'custom']),
    dayOfWeek: z.number().min(0).max(6),
    cron: z.string(),
    time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, i18n.t('settingsValidation.invalidTimeFormat')).optional(),
    type: z.enum(['json', 'zip']),
    emailDelivery: z.boolean().optional(),
    encryption: z.object({
        password: z.string().optional(),
    }),
    retention: z.object({
        count: z.number().int().min(1).max(100),
    }),
    path: z.string(), // Read-only
});

export const securitySettingsSchema = z.object({
    mfa: z.object({
        enabled: z.boolean(),
        enforced: z.boolean(),
        methods: z.object({
            totp: z.boolean(),
            email: z.boolean(),
            backup: z.boolean(),
        }),
    }),
    passkeys: z.object({
        enabled: z.boolean(),
        enforced: z.boolean(),
    }),
    session: z.object({
        timeout: z.number().min(5).max(1440), // minutes, 5min to 24h
        forceReauth: z.boolean(),
    }),
});
