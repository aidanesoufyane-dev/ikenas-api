/**
 * Routes d'authentification
 */
const express = require('express');
const router = express.Router();
const { login, register, getMe, updatePassword } = require('../controllers/authController');
const { protect, roleCheck } = require('../middleware/auth');

// Routes publiques
router.post('/login', login);

// Routes protégées
router.post('/register', protect, roleCheck('admin'), register);
router.get('/me', protect, getMe);
router.put('/update-password', protect, updatePassword);

module.exports = router;
