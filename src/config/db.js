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
            INSERT OR REPLACE INTO tasks(id, periodicity, description, procedure_url, start_date, end_date, active_until, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                        t.id,
                        t.periodicity,
                        t.description,
                        t.procedure_url || "",
                        t.start_date,
                        t.end_date || "",
                        t.active_until || "",
                        t.created_at || nowIso(),
                        t.updated_at || nowIso()
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
      updated_at TEXT NOT NULL
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

  `);

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
