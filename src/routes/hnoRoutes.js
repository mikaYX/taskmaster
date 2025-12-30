const express = require("express");
const { listHnoGroups, addHnoGroup, editHnoGroup, removeHnoGroup, getHnoFeatureState, setHnoFeatureState } = require("../controllers/HnoController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/hno/groups", requireRole("admin", "user"), listHnoGroups);
router.post("/hno/groups", requireRole("admin"), addHnoGroup);
router.put("/hno/groups/:id", requireRole("admin"), editHnoGroup);
router.delete("/hno/groups/:id", requireRole("admin"), removeHnoGroup);

router.get("/hno/status", getHnoFeatureState);
router.post("/hno/status", requireRole("admin"), setHnoFeatureState);

module.exports = router;
