const createError = require('http-errors');
const { adminAuthSchema } = require('../middleware/authValidator.js');
const Admin = require('../models/admin.models.js');
const {
  signAccessToken,
  signRefreshToken,
} = require('../middleware/jwtHelper.js');

module.exports = {
  register: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await adminAuthSchema.validateAsync(req.body);
      const doesExist = await Admin.findOne({ email: email });
      if (doesExist) throw createError.Conflict(`${email} already exists`);

      const admin = new Admin(result);
      const savedAdmin = await admin.save();

      const accessToken = await signAccessToken(savedAdmin.id);
      const refreshToken = await signRefreshToken(savedAdmin.id);

      const user = {
        _id: savedAdmin._id,
        name: savedAdmin.name,
        email: savedAdmin.email,
        role: savedAdmin.role,
      };

      res.send({ accessToken, refreshToken, user });
    } catch (error) {
      if (error.isJoi) {
        const errorMessages = error.details.map((detail) => detail.message);
        return res.status(400).json({
          status: 'error',
          messages: errorMessages,
        });
      }

      if (error.status === 409) {
        return res.status(409).json({
          status: 'error',
          message: error.message,
        });
      }

      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
      });
    }
  },

  login: async (req, res, next) => {
    try {
      const result = await adminAuthSchema.validateAsync(req.body);
      const admin = await Admin.findOne({ email: result.email });
      if (!admin) throw createError.NotFound('Admin not registered');

      const isMatch = await admin.isValidPassword(result.password);
      if (!isMatch)
        throw createError.Unauthorized('email or password not valid');

      const accessToken = await signAccessToken(admin.id);
      const refreshToken = await signRefreshToken(admin.id);

      const user = {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      };

      res.send({ accessToken, refreshToken, user });
    } catch (error) {
      if (error.isJoi) {
        const errorMessages = error.details.map((detail) => detail.message);
        return res.status(400).json({
          status: 'error',
          messages: errorMessages,
        });
      }

      if (
        error.status === 404 ||
        error.status === 401 ||
        error.status === 409
      ) {
        return res.status(error.status).json({
          status: 'error',
          message: error.message,
        });
      }

      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
      });
    }
  },
};
