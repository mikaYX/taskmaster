'use strict';

/**
 * Connects to a PostgreSQL server and prints its major version number to
 * stdout (e.g. "17"). Run by test-prerequisites.ps1 via the bundled Node
 * runtime + the app's own `pg` dependency - no extra binary needed.
 *
 * Reads the connection string from TASKMASTER_CHECK_DATABASE_URL (env var,
 * not a CLI argument) so the password never appears in a process listing
 * (Get-CimInstance Win32_Process), matching the pattern already used by
 * installer/provision/provision-postgres.ps1 for its admin password.
 */
const { Client } = require('pg');

async function main() {
    const connectionString = process.env.TASKMASTER_CHECK_DATABASE_URL;
    if (!connectionString) {
        throw new Error('TASKMASTER_CHECK_DATABASE_URL is not set.');
    }

    const client = new Client({ connectionString, connectionTimeoutMillis: 8000 });
    await client.connect();
    try {
        const res = await client.query('SHOW server_version_num');
        const versionNum = parseInt(res.rows[0].server_version_num, 10);
        const major = Math.floor(versionNum / 10000);
        process.stdout.write(String(major));
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    process.stderr.write(err && err.message ? err.message : String(err));
    process.exit(1);
});
