const express = require("express");
const { getSession, logout, loginUser, loginAdmin } = require("../controllers/AuthController");

const router = express.Router();

router.get("/session", getSession);
router.post("/logout", logout);
router.post("/login-user", loginUser);
router.post("/login-admin", loginAdmin);

module.exports = router;
