const User = require('../models/User');

/**
 * GET /api/v1/users/clients
 * Returns a list of registered clients (Accessible to Lawyers).
 */
const getClientsList = async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' }).select('name email publicKey createdAt');
    return res.json({ clients });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve clients list.' });
  }
};

/**
 * GET /api/v1/users/:id/public-key
 * Retrieves public key for a target user for RSA-OAEP DEK wrapping.
 */
const getUserPublicKey = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email role publicKey');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      publicKey: user.publicKey
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve user public key.' });
  }
};

module.exports = {
  getClientsList,
  getUserPublicKey
};
