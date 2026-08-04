'use strict';

/**
 * Idempotently ensures the Taskmaster PostgreSQL role + database exist on an
 * *existing* (operator-supplied) PostgreSQL server, connecting as a
 * superuser/admin role. Mirrors provision-postgres.ps1's role/database
 * creation for the "Local" (bundled) PostgreSQL path, but reused here for
 * "Existing" mode where the target server isn't one this installer set up
 * itself.
 *
 * Only runs at all when the operator supplied admin credentials in
 * TaskmasterConfigDlg (UI.wxs) - if left blank, the installer assumes the
 * role/database were already created by the DBA and skips this entirely
 * (see orchestrate-install.ps1).
 *
 * All values come from environment variables, never CLI arguments, so
 * nothing sensitive appears in a process listing (Get-CimInstance
 * Win32_Process) - same pattern as check-postgres-version.js and
 * provision-postgres.ps1's response-file approach for the PostgreSQL
 * installer's own admin password.
 */
const { Client } = require('pg');

// Role/database names go into interpolated identifiers below (Postgres
// doesn't support parameterized identifiers) - restrict to a conservative
// safe charset first. Values, never identifiers, use real query parameters.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function assertSafeIdentifier(name, label) {
    if (!name || !IDENTIFIER_RE.test(name)) {
        throw new Error(`${label} "${name}" is not a valid PostgreSQL identifier (letters, digits, underscore only, must start with a letter or underscore, max 63 chars).`);
    }
    return name;
}

async function main() {
    const adminConnectionString = process.env.TASKMASTER_ADMIN_DATABASE_URL;
    const dbPassword = process.env.TASKMASTER_APP_DB_PASSWORD;
    const dbUser = assertSafeIdentifier(process.env.TASKMASTER_APP_DB_USER, 'PostgreSQL user');
    const dbName = assertSafeIdentifier(process.env.TASKMASTER_APP_DB_NAME, 'PostgreSQL database');

    if (!adminConnectionString || !dbPassword) {
        throw new Error('Missing TASKMASTER_ADMIN_DATABASE_URL or TASKMASTER_APP_DB_PASSWORD.');
    }

    const client = new Client({ connectionString: adminConnectionString, connectionTimeoutMillis: 8000 });
    await client.connect();
    try {
        const roleExists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [dbUser]);
        if (roleExists.rowCount === 0) {
            await client.query(`CREATE ROLE "${dbUser}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
        }
        // ALTER ROLE is a utility statement - PostgreSQL does not support
        // bind parameters ($1) there at all ("erreur de syntaxe sur ou pres
        // de $1", confirmed on a real install). quote_literal() runs as a
        // normal parameterized SELECT (which DOES support $1), producing an
        // already safely-escaped SQL string literal (quotes/backslashes
        // handled) that can then be spliced directly into the ALTER ROLE
        // text without any injection risk.
        const quoted = await client.query('SELECT quote_literal($1) AS q', [dbPassword]);
        const quotedPassword = quoted.rows[0].q;
        await client.query(`ALTER ROLE "${dbUser}" WITH PASSWORD ${quotedPassword}`);

        const dbExists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (dbExists.rowCount === 0) {
            // CREATE DATABASE cannot run inside a multi-statement/transaction
            // context in some drivers - node-postgres runs each .query() as
            // its own implicit statement here, so this is safe as-is.
            await client.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
        }
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    process.stderr.write(err && err.message ? err.message : String(err));
    process.exit(1);
});
