/**
 * Routes Dashboard
 */
const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/dashboardController');
const { protect, roleCheck } = require('../middleware/auth');

router.get('/stats', protect, roleCheck('admin'), getStats);

module.exports = router;
