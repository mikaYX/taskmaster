import { describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { authSettingsSchema, backupSettingsSchema, emailSettingsSchema, exportSettingsSchema } from './settings-schemas';

describe('shared settings form rules', () => {
    const senderSchemas = [
        emailSettingsSchema.shape.smtp.unwrap().shape.from,
        emailSettingsSchema.shape.mailgun.unwrap().shape.from,
        emailSettingsSchema.shape.mailjet.unwrap().shape.from,
        emailSettingsSchema.shape.sendgrid.unwrap().shape.from,
    ];
    it.each(['', undefined, 'Person@example.com'])('accepts the existing optional sender value %s in every provider', value => {
        for (const schema of senderSchemas) expect(schema.parse(value)).toBe(value);
    });
    it('preserves the translated sender validation error', () => {
        for (const schema of senderSchemas) {
            const result = schema.safeParse('invalid');
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(i18n.t('settingsValidation.invalidEmailAddress'));
            }
        }
    });
    it('keeps optional OIDC/SAML URLs distinct from LDAP messages', () => {
        const schemas = [
            authSettingsSchema.shape.generic.shape.oidc.shape.issuer,
            authSettingsSchema.shape.generic.shape.saml.shape.ssoUrl,
            authSettingsSchema.shape.generic.shape.saml.shape.metadataUrl,
        ];
        for (const schema of schemas) {
            for (const value of ['', undefined, 'https://example.com']) expect(schema.parse(value)).toBe(value);
            expect(schema.safeParse('not a URL').success).toBe(false);
        }
        const result = authSettingsSchema.shape.ldap.shape.url.safeParse('invalid');
        if (result.success) throw new Error('Invalid LDAP URL accepted');
        expect(result.error.issues[0].message).toBe(i18n.t('settingsValidation.invalidLdapUrl'));
    });
    it('preserves weekday bounds and does not introduce an integer constraint', () => {
        for (const schema of [backupSettingsSchema.shape.dayOfWeek, exportSettingsSchema.shape.autoExport.shape.dayOfWeek]) {
            for (const value of [0, 1.5, 6]) expect(schema.parse(value)).toBe(value);
            for (const value of [-1, 7, '1']) expect(schema.safeParse(value).success).toBe(false);
        }
    });
    it('keeps the same format choices for files and attachments', () => {
        const exportSchema = exportSettingsSchema.shape.autoExport;
        for (const schema of [exportSchema.shape.formats, exportSchema.shape.email.shape.formats]) {
            expect(schema.parse([])).toEqual([]);
            expect(schema.parse(['csv', 'pdf'])).toEqual(['csv', 'pdf']);
            expect(schema.safeParse(['xlsx']).success).toBe(false);
        }
    });
    it('preserves existing time, port and strict boolean form behavior', () => {
        const time = backupSettingsSchema.shape.time;
        for (const value of ['8:00', '08:00', '23:59', undefined]) expect(time.parse(value)).toBe(value);
        for (const value of ['', '24:00', '08:60']) expect(time.safeParse(value).success).toBe(false);
        const port = emailSettingsSchema.shape.smtp.unwrap().shape.port;
        for (const value of [1, 65536, undefined]) expect(port.parse(value)).toBe(value);
        for (const value of [0, 1.5, '587']) expect(port.safeParse(value).success).toBe(false);
        const enabled = emailSettingsSchema.shape.enabled;
        expect(enabled.parse(true)).toBe(true);
        expect(enabled.parse(false)).toBe(false);
        expect(enabled.safeParse('true').success).toBe(false);
    });
});
