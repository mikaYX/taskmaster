const express = require("express");
const { listTasks, createTask, updateTaskById, stopTask, removeTask, checkUserDependencies, reassignUserTasks } = require("../controllers/TaskController");
const { listTaskDelegations, addDelegation, removeDelegation } = require("../controllers/DelegationController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/tasks", requireRole("admin"), listTasks);
router.post("/tasks", requireRole("admin"), createTask);
router.put("/tasks/:id", requireRole("admin"), updateTaskById);
router.post("/tasks/:id/stop", requireRole("admin"), stopTask);
router.delete("/tasks/:id", requireRole("admin"), removeTask);

// Delegations
router.get("/tasks/:id/delegations", requireRole("admin"), listTaskDelegations);
router.post("/tasks/:id/delegations", requireRole("admin"), addDelegation);
router.delete("/delegations/:id", requireRole("admin"), removeDelegation);

router.post('/check-user-dependencies', requireRole("admin"), checkUserDependencies);
router.post('/reassign-user', requireRole("admin"), reassignUserTasks);

module.exports = router;
