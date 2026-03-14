import { authSettingsSchema } from './src/features/settings/schemas/settings-schemas';
const data = {
    mfa: { required: false, methods: [] },
    passkeys: { enabled: true },
    requirements: {
        admin: { mfa: false, passkeys: false },
        user: { mfa: false, passkeys: false }
    },
    session: { timeout: 30, secureActions: false },
    azureAd: { enabled: false, tenantId: '', clientId: '', clientSecret: '' },
    google: { enabled: false, clientId: '', clientSecret: '', hostedDomain: '' },
    generic: {
        enabled: false,
        type: 'oidc',
        oidc: { issuer: '', clientId: '', clientSecret: '', scopes: 'openid profile email', providerName: '' },
        saml: { entityId: '', ssoUrl: '', x509: '', metadataUrl: '' }
    },
    ldap: { enabled: false, url: '', bindDn: '', bindPassword: '', searchBase: '', searchFilter: '(mail={{usermail}})' }
};
const result = authSettingsSchema.safeParse(data);
if (!result.success) console.dir(result.error.errors, { depth: null });
else console.log('SUCCESS');
