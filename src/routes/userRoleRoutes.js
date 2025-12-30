const express = require("express");
const router = express.Router();
const { listRoles, addRole, removeRole } = require("../controllers/UserRoleController");

router.get("/roles", listRoles);
router.post("/roles", addRole);
router.delete("/roles/:id", removeRole);

module.exports = router;
