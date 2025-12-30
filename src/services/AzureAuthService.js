const msal = require('@azure/msal-node');
const { getConfig } = require('../models/Config');
const { decrypt } = require('../utils/security');
const { getUserByExternalId, getUserByUsername, getUserByEmail, createUser, updateUser } = require('../models/User');

const REDIRECT_URI = 'http://localhost:3000/api/auth/azure/callback';

async function getMsalApp() {
    const config = await getConfig();
    if (!config.auth_azure_enabled) {
        throw new Error("Azure AD authentication is not enabled.");
    }
    if (!config.auth_azure_client_id || !config.auth_azure_tenant_id) {
        throw new Error("Azure AD Client ID or Tenant ID is missing.");
    }

    let clientSecret = "";
    try {
        clientSecret = decrypt(config.auth_azure_client_secret || "");
    } catch (e) {
        throw new Error("Failed to decrypt Azure Client Secret.");
    }

    if (!clientSecret) {
        throw new Error("Azure Client Secret is empty.");
    }

    const msalConfig = {
        auth: {
            clientId: config.auth_azure_client_id,
            authority: `https://login.microsoftonline.com/${config.auth_azure_tenant_id}`,
            clientSecret: clientSecret,
        },
        system: {
            loggerOptions: {
                loggerCallback(loglevel, message, containsPii) {
                    // console.log(message); // Uncomment for debug
                },
                piiLoggingEnabled: false,
                logLevel: msal.LogLevel.Info,
            }
        }
    };

    return new msal.ConfidentialClientApplication(msalConfig);
}

async function getAuthUrl() {
    const app = await getMsalApp();
    const authCodeUrlParameters = {
        scopes: ["user.read", "email", "openid", "profile"],
        redirectUri: REDIRECT_URI,
    };

    return await app.getAuthCodeUrl(authCodeUrlParameters);
}

async function handleCallback(code) {
    if (!code) throw new Error("No authorization code provided in callback.");

    const app = await getMsalApp();
    const tokenRequest = {
        code: code,
        scopes: ["user.read", "email", "openid", "profile"],
        redirectUri: REDIRECT_URI,
    };

    const response = await app.acquireTokenByCode(tokenRequest);
    const account = response.account;
    const claims = response.idTokenClaims || {};

    // Azure OID (Object ID) is the immutable user identifier
    const oid = claims.oid || account.homeAccountId.split('.')[0];
    const email = account.username || claims.email || claims.preferred_username || "";
    const name = account.name || claims.name || "";

    console.log("--------------- AZURE AUTH DEBUG ---------------");
    console.log("OID:", oid);
    console.log("Extracted Email:", email);
    console.log("Account Username:", account.username);
    console.log("Claims Email:", claims.email);
    console.log("Claims Preferred Username:", claims.preferred_username);
    console.log("------------------------------------------------");

    if (!oid) throw new Error("Could not retrieve user Object ID (OID) from Azure token.");

    // 1. Find by external ID
    let user = await getUserByExternalId(oid);

    // 2. Fallback: Find by email
    if (!user && email) {
        // Try by Email first, then by Username (as email)
        user = await getUserByEmail(email);
        if (!user) user = await getUserByUsername(email);

        if (user) {
            // Link existing user
            await updateUser(user.id, {
                external_id: oid,
                auth_provider: 'azure' // Update provider or keep 'local'? Let's set 'azure' to mark it.
            });
            // Reload user
            user = await getUserByExternalId(oid);
        }
    }

    // 3. Create new user
    // 3. User not found -> Deny access (Manual provisioning required)
    if (!user) {
        throw new Error("Account not found. Please contact your administrator to create your account.");
    }

    if (!user) throw new Error("Failed to provision user from Azure identity.");

    return user;
}

module.exports = { getAuthUrl, handleCallback };
