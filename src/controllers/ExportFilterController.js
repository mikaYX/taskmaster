const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '../../data/export_filters');

// Helper to get user's file path
const getFilePath = (userId) => path.join(STORAGE_DIR, `${userId}.json`);

// Helper to read presets
const readPresets = (userId) => {
    const filePath = getFilePath(userId);
    if (!fs.existsSync(filePath)) return [];
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data) || [];
    } catch (e) {
        console.error(`Error reading presets for user ${userId}`, e);
        return [];
    }
};

// Helper to write presets
const writePresets = (userId, presets) => {
    const filePath = getFilePath(userId);
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(presets, null, 2), 'utf8');
};

async function listPresets(req, res) {
    const userId = req.auth?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const presets = readPresets(userId);
    res.json(presets);
}

async function savePreset(req, res) {
    const userId = req.auth?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, filters } = req.body || {};
    if (!name || !filters) return res.status(400).json({ error: "Missing name or filters" });

    let presets = readPresets(userId);

    // Update existing or add new
    const idx = presets.findIndex(p => p.name === name);
    if (idx >= 0) {
        presets[idx].filters = filters;
    } else {
        presets.push({ name, filters });
    }

    writePresets(userId, presets);
    res.json({ ok: true, presets });
}

async function deletePreset(req, res) {
    const userId = req.auth?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name } = req.params;
    if (!name) return res.status(400).json({ error: "Missing name" });

    let presets = readPresets(userId);
    presets = presets.filter(p => p.name !== name);

    writePresets(userId, presets);
    res.json({ ok: true, presets });
}

module.exports = {
    listPresets,
    savePreset,
    deletePreset
};
