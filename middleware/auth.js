const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.models.js');

exports.isAdmin = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    try {
      // Verify token using the correct secret
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      // Check if admin exists
      const admin = await Admin.findById(decoded.aud);
      if (!admin) {
        return res.status(401).json({ error: 'Not authorized' });
      }

      // Add admin to request object
      req.admin = admin;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
