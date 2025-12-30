const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { nowIso } = require("../utils/time");

const DATA_DIR = path.join(process.cwd(), "data"); // Use process.cwd() or logic to find root
// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILE_CONFIG_JSON = path.join(DATA_DIR, "config.json");
const FILE_TASKS_JSON = path.join(DATA_DIR, "tasks.json");
const FILE_STATUSES_JSON = path.join(DATA_DIR, "statuses.json");
const DB_FILE = path.join(DATA_DIR, "checklist.db");

let db = null;

async function readJson(file, fallback) {
    try {
        const s = await fsp.readFile(file, "utf8");
        return JSON.parse(s);
    } catch {
        return fallback;
    }
}

async function migrateFromLegacyJsonIfAny() {
    // If DB has no config/tasks/statuses, import from JSON if present
    const cfgCount = (await db.get(`SELECT COUNT(*) AS c FROM config`))?.c || 0;
    const taskCount = (await db.get(`SELECT COUNT(*) AS c FROM tasks`))?.c || 0;
    const stCount = (await db.get(`SELECT COUNT(*) AS c FROM statuses`))?.c || 0;

    const hasConfigJson = fs.existsSync(FILE_CONFIG_JSON);
    const hasTasksJson = fs.existsSync(FILE_TASKS_JSON);
    const hasStatusesJson = fs.existsSync(FILE_STATUSES_JSON);

    if (cfgCount === 0 && hasConfigJson) {
        const cfg = await readJson(FILE_CONFIG_JSON, null);
        if (cfg && typeof cfg === "object") {
            await db.exec("BEGIN");
            try {
                for (const [k, v] of Object.entries(cfg)) {
                    await db.run(`INSERT OR REPLACE INTO config(k, v) VALUES(?, ?)`, [k, JSON.stringify(v)]);
                }
                await db.exec("COMMIT");
            } catch (e) {
                await db.exec("ROLLBACK");
                throw e;
            }
        }
    }

    if (taskCount === 0 && hasTasksJson) {
        const tasks = await readJson(FILE_TASKS_JSON, []);
        if (Array.isArray(tasks) && tasks.length) {
            await db.exec("BEGIN");
            try {
                for (const t of tasks) {
                    await db.run(`
            INSERT OR REPLACE INTO tasks(id, periodicity, description, procedure_url, start_date, end_date, active_until, created_at, updated_at, assigned_user_id)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                        t.id,
                        t.periodicity,
                        t.description,
                        t.procedure_url || "",
                        t.start_date,
                        t.end_date || "",
                        t.active_until || "",
                        t.created_at || nowIso(),
                        t.updated_at || nowIso(),
                        t.assigned_user_id || null
                    ]);
                }
                await db.exec("COMMIT");
            } catch (e) {
                await db.exec("ROLLBACK");
                throw e;
            }
        }
    }

    if (stCount === 0 && hasStatusesJson) {
        const map = await readJson(FILE_STATUSES_JSON, {});
        if (map && typeof map === "object") {
            await db.exec("BEGIN");
            try {
                for (const [k, v] of Object.entries(map)) {
                    if (!v || typeof v !== "object") continue;
                    await db.run(`
            INSERT OR REPLACE INTO statuses(k, status, comment, updated_at)
            VALUES(?, ?, ?, ?)
          `, [
                        k,
                        v.status || "pending",
                        v.comment || "",
                        v.updated_at || nowIso()
                    ]);
                }
                await db.exec("COMMIT");
            } catch (e) {
                await db.exec("ROLLBACK");
                throw e;
            }
        }
    }
}

// Config defaults logic needs to be handled.
// In original server.cjs, `getConfig` handles "ensure defaults".
// We will move that to a Config model or service.
// `initDb` here just prepares tables.

async function initDb() {
    db = await open({ filename: DB_FILE, driver: sqlite3.Database });

    await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS config (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      periodicity TEXT NOT NULL,
      description TEXT NOT NULL,
      procedure_url TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL DEFAULT '',
      active_until TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      assigned_user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS statuses (
      k TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notif (
      k TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- 'admin' or 'user'
      created_at TEXT NOT NULL
    );

    -- Upgrade tasks table if needed
    -- (We can't easily ALTER TABLE IF NOT EXISTS column in sqlite safely in one line without check)
    -- But we can try adding the column and ignore error if exists, or check via PRAGMA.
    -- For simplicity in this environment, I'll allow the error or use a safe column add block below.

    CREATE TABLE IF NOT EXISTS task_assignments (
      task_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_group_memberships (
      user_id INTEGER NOT NULL,
      role_name TEXT NOT NULL,
      PRIMARY KEY (user_id, role_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_group_assignments (
      task_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (task_id, group_name),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_delegations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      delegate_user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (delegate_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

    try {
        await db.run(`
            CREATE TABLE IF NOT EXISTS hno_groups (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              days TEXT NOT NULL,
              start_time TEXT NOT NULL,
              end_time TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
        `);
    } catch (e) {
        console.error("Creation of hno_groups table failed:", e);
    }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN deleted_at TEXT`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE tasks ADD COLUMN hno_group_id INTEGER`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN fullname TEXT`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN email TEXT`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE tasks ADD COLUMN assigned_user_id INTEGER`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE tasks ADD COLUMN assigned_group TEXT`);
    } catch (e) {
        // Ignore if exists
    }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN external_id TEXT`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE tasks ADD COLUMN skip_weekends INTEGER DEFAULT 1`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE tasks ADD COLUMN skip_holidays INTEGER DEFAULT 1`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE statuses ADD COLUMN updated_by_user_id INTEGER`);
    } catch (e) { }

    try {
        await db.run(`ALTER TABLE statuses ADD COLUMN updated_by_username TEXT`);
    } catch (e) { }

    // Fix legacy tasks (or those created with DEFAULT 0 by mistake) to default to Skiping (standard behavior)
    try {
        // We update tasks where both are 0, assuming they were just created by the default 0 migration.
        // This is safe-ish for this context.
        await db.run(`UPDATE tasks SET skip_weekends=1, skip_holidays=1 WHERE skip_weekends=0 AND skip_holidays=0`);
    } catch (e) { }

    // Initialize system roles if they don't exist
    const { nowIso } = require("../utils/time");
    const now = nowIso();
    try {
        await db.run(`INSERT OR IGNORE INTO user_roles (name, is_system, created_at) VALUES ('admin', 1, ?)`, [now]);
        await db.run(`INSERT OR IGNORE INTO user_roles (name, is_system, created_at) VALUES ('user', 1, ?)`, [now]);
    } catch (e) {
        console.error('Failed to initialize system roles:', e);
    }

    // Fix invalid cron expressions in config
    try {
        const cron = require("node-cron");
        const rows = await db.all(`SELECT k, v FROM config WHERE k IN ('auto_export_cron', 'auto_backup_cron')`);

        for (const row of rows) {
            let val = null;
            try { val = JSON.parse(row.v); } catch (e) { }

            if (val && !cron.validate(val)) {
                console.log(`Fixing invalid cron for ${row.k}:`, val);
                const defaultCron = row.k === 'auto_export_cron' ? '30 19 * * *' : '0 2 * * *';
                await db.run(`UPDATE config SET v = ? WHERE k = ?`, [JSON.stringify(defaultCron), row.k]);
            }
        }
    } catch (e) {
        console.error('Failed to fix cron expressions:', e);
    }

    await migrateFromLegacyJsonIfAny();

    return db;
}

function getDb() {
    if (!db) throw new Error("DB not initialized");
    return db;
}

module.exports = {
    initDb,
    getDb
};
