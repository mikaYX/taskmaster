const ActiveDirectory = require('activedirectory2');
const { decrypt } = require('../utils/security');

/**
 * Authenticate against LDAP
 * @param {object} config - Application config object (contains encrypted secrets)
 * @param {string} username - User input username
 * @param {string} password - User input password
 * @returns {Promise<object|null>} - Returns user attributes if success, null otherwise
 */
async function authenticateLdap(config, username, password) {
    if (!config.auth_ldap_enabled) return null;
    if (!config.auth_ldap_url || !config.auth_ldap_search_base) return null;

    const bindPassword = decrypt(config.auth_ldap_bind_password || "");

    const adConfig = {
        url: config.auth_ldap_url,
        baseDN: config.auth_ldap_search_base,
        username: config.auth_ldap_bind_dn,
        password: bindPassword,
    };

    const ad = new ActiveDirectory(adConfig);

    return new Promise((resolve) => {
        // 1. Authenticate the user
        // We need to resolve the user DN or UPN. 
        // If the 'filter' is provided, we might need to find the user first.
        // But ActiveDirectory lib has an 'authenticate' method that often takes sAMAccountName depending on AD config.
        // Let's assume username is passed as sAMAccountName or PrincipalName.

        // However, standard LDAP auth usually requires binding AS the user.
        // Or using the service account to find the user DN, then bind as user.
        // The library `activedirectory2` has an `authenticate` method:
        // ad.authenticate(username, password, function(err, auth) { ... })
        // Note: `username` here usually needs to be User Principal Name (user@domain) or DN for standard LDAP, 
        // but for Active Directory it often accepts sAMAccountName too if the server supports it.

        // To be safe, let's try to FIND the user first to get their DN/attributes, 
        // then try to authenticate if needed, OR just trust `ad.authenticate`.
        // Better: Find user attributes to map them to our DB (fullname, email).

        // Construct filter
        // const filter = config.auth_ldap_filter || `(sAMAccountName=${username})`; 
        // We need to replace {{username}} placeholder if present, else append.
        let filter = config.auth_ldap_filter || "(sAMAccountName={{username}})";
        filter = filter.replace("{{username}}", username);

        // Security: Avoid LDAP injection if possible? username should be sanitized.
        // For now, basic replacement.

        ad.findUser(filter, (err, user) => {
            if (err) {
                console.error("LDAP Find Error:", err);
                return resolve(null);
            }
            if (!user) {
                return resolve(null);
            }

            // User found, now try to authenticate (check password)
            // We use the user's DN or UPN found.
            ad.authenticate(user.dn, password, (authErr, auth) => {
                if (authErr) {
                    console.error("LDAP Auth Failed:", authErr);
                    return resolve(null);
                }
                if (auth) {
                    // Success
                    resolve({
                        username: username, // or user.sAMAccountName
                        fullname: user.displayName || user.cn || "",
                        email: user.mail || user.userPrincipalName || "",
                        groups: [], // Mapping groups is complex, omitting for now
                        external_id: user.dn
                    });
                } else {
                    resolve(null);
                }
            });
        });
    });
}

module.exports = { authenticateLdap };
