const express = require('express');
const router = express.Router();
const { getMyNotifications, markAsRead, deleteNotification, clearNotifications } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getMyNotifications);
router.put('/read', protect, markAsRead);
router.delete('/', protect, clearNotifications);
router.delete('/:id', protect, deleteNotification);

module.exports = router;
