const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const { requireAuth } = require('../middleware/auth');


router.get('/dashboard/stats', requireAuth, DashboardController.getDashboardStats);

module.exports = router;
