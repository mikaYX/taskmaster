const { getAllHnoGroups, createHnoGroup, updateHnoGroup, deleteHnoGroup } = require("../models/HnoGroup");
const { getConfig, setConfig } = require("../models/Config");

async function listHnoGroups(req, res) {
    try {
        const list = await getAllHnoGroups();
        res.json(list);
    } catch (e) {
        console.error("listHnoGroups error:", e);
        res.status(500).json({ error: e.message });
    }
}

async function addHnoGroup(req, res) {
    try {
        const { name, days, start_time, end_time } = req.body;
        if (!name || !days || !start_time || !end_time) {
            return res.status(400).json({ error: "Missing fields" });
        }
        const id = await createHnoGroup({ name, days, start_time, end_time });
        res.json({ ok: true, id });
    } catch (e) {
        console.error("addHnoGroup error:", e);
        res.status(500).json({ error: e.message });
    }
}

async function editHnoGroup(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, days, start_time, end_time } = req.body;
        await updateHnoGroup(id, { name, days, start_time, end_time });
        res.json({ ok: true });
    } catch (e) {
        console.error("editHnoGroup error:", e);
        res.status(500).json({ error: e.message });
    }
}

async function removeHnoGroup(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        await deleteHnoGroup(id);
        res.json({ ok: true });
    } catch (e) {
        console.error("removeHnoGroup error:", e);
        res.status(500).json({ error: e.message });
    }
}

// Global Feature Toggle
async function getHnoFeatureState(req, res) {
    const cfg = await getConfig();
    res.json({ enabled: cfg.feature_hno_enabled === 'true' });
}

async function setHnoFeatureState(req, res) {
    const { enabled } = req.body;
    await setConfig({ feature_hno_enabled: enabled ? 'true' : 'false' });
    res.json({ ok: true });
}

module.exports = {
    listHnoGroups,
    addHnoGroup,
    editHnoGroup,
    removeHnoGroup,
    getHnoFeatureState,
    setHnoFeatureState
};
