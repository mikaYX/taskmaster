const express = require("express");
const { listTasks, createTask, updateTaskById, stopTask, removeTask } = require("../controllers/TaskController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/tasks", requireRole("admin"), listTasks);
router.post("/tasks", requireRole("admin"), createTask);
router.put("/tasks/:id", requireRole("admin"), updateTaskById);
router.post("/tasks/:id/stop", requireRole("admin"), stopTask);
router.delete("/tasks/:id", requireRole("admin"), removeTask);

module.exports = router;
