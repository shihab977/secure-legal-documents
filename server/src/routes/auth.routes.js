const express = require('express');
const router = express.Router();
const { authRateLimiter } = require('../middleware/rateLimiter');
const { authenticateJWT } = require('../middleware/auth.middleware');
const {
  getUserSalt,
  registerUser,
  loginUser,
  getCurrentUser,
  updateProfile
} = require('../controllers/auth.controller');

router.get('/salt', getUserSalt);
router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.get('/me', authenticateJWT, getCurrentUser);
router.put('/profile', authenticateJWT, updateProfile);

module.exports = router;
