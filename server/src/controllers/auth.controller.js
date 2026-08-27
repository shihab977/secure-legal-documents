const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { hashAuthHash, verifyAuthHash } = require('../utils/argon2Server');

/**
 * GET /api/v1/auth/salt?email=user@domain.com
 * Retrieves the salt for the given email to allow client-side key derivation.
 * If user does not exist, returns a pseudo-random deterministic salt to prevent user enumeration.
 */
const getUserSalt = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      return res.json({ userSalt: user.userSalt });
    }

    // Return deterministic pseudo-salt for non-existent emails to prevent account enumeration timing attacks
    const mockSalt = crypto.createHash('sha256').update(email.toLowerCase().trim() + '_salt_pepper').digest('base64');
    return res.json({ userSalt: mockSalt });
  } catch (error) {
    console.error('[Salt Retrieval Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve user salt.' });
  }
};

/**
 * POST /api/v1/auth/register
 * Registers a new Lawyer or Client account.
 */
const registerUser = async (req, res) => {
  try {
    // SECURITY GUARD: Ensure client NEVER sends plaintext MasterKey or PrivateKey
    if (req.body.masterKey || req.body.privateKey || req.body.password) {
      return res.status(400).json({
        error: 'Security violation: MasterKey, raw passwords, or plaintext PrivateKey must never be sent to the backend.'
      });
    }

    const { name, email, role, authHash, userSalt, publicKey, encryptedPrivateKey, privateKeyIV } = req.body;

    if (!name || !email || !role || !authHash || !userSalt || !publicKey || !encryptedPrivateKey || !privateKeyIV) {
      return res.status(400).json({ error: 'All fields including key material are required for registration.' });
    }

    if (!['lawyer', 'client'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be either lawyer or client.' });
    }

    // Check for duplicate email
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email address already exists.' });
    }

    // Hash the client's AuthHash using server-side Argon2id
    const serverAuthHash = await hashAuthHash(authHash);

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      authHash: serverAuthHash,
      userSalt,
      publicKey,
      encryptedPrivateKey,
      privateKeyIV
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_2026',
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: newUser.toJSON()
    });
  } catch (error) {
    console.error('[Registration Error]', error.message);
    return res.status(500).json({ error: 'Registration failed due to server error.' });
  }
};

/**
 * POST /api/v1/auth/login
 * Authenticates user via AuthHash and issues JWT token.
 */
const loginUser = async (req, res) => {
  try {
    // SECURITY GUARD
    if (req.body.masterKey || req.body.privateKey || req.body.password) {
      return res.status(400).json({
        error: 'Security violation: MasterKey, raw passwords, or plaintext PrivateKey must never be sent to the backend.'
      });
    }

    const { email, authHash } = req.body;
    if (!email || !authHash) {
      return res.status(400).json({ error: 'Email and authHash are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+authHash');
    if (!user) {
      return res.status(401).json({ error: 'Invalid authentication credentials.' });
    }

    // Verify client AuthHash against stored server hash
    const isValid = await verifyAuthHash(user.authHash, authHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid authentication credentials.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_2026',
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful.',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('[Login Error]', error.message);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
};

/**
 * GET /api/v1/auth/me
 * Retrieves current authenticated user details.
 */
const getCurrentUser = async (req, res) => {
  return res.json({ user: req.user });
};

/**
 * PUT /api/v1/auth/profile
 * Updates user profile details, strictly forbidding role escalation.
 */
const updateProfile = async (req, res) => {
  try {
    if (req.body.role && req.body.role !== req.user.role) {
      return res.status(403).json({ error: 'Role escalation forbidden. User role cannot be modified.' });
    }

    if (req.body.name) {
      req.user.name = req.body.name.trim();
      await req.user.save();
    }

    return res.json({ message: 'Profile updated successfully.', user: req.user });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

module.exports = {
  getUserSalt,
  registerUser,
  loginUser,
  getCurrentUser,
  updateProfile
};
