const Joi = require('joi');

const adminAuthSchema = Joi.object({
  email: Joi.string()
    .email()
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.email':
        'Email must be a valid email address (e.g., example@domain.com)', // Custom message for email validation
      'string.empty': 'Email is required',
      'any.required': 'Email is a required field',
    }),

  password: Joi.string().min(8).max(100).required().messages({
    'string.base': 'Password must be a string',
    'string.empty': 'Password is required',
    'string.min': 'Password should have at least 8 characters',
    'string.max': 'Password should not exceed 100 characters',
    'any.required': 'Password is a required field',
  }),
});

const userAuthSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Name must be a string',
    'string.empty': 'Name is required',
    'string.min': 'Name should have at least 2 characters',
    'string.max': 'Name should not exceed 50 characters',
    'any.required': 'Name is a required field',
  }),
  email: Joi.string()
    .email()
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.pattern.base':
        'Email must be a valid email address (e.g., example@domain.com)',
    }),
  password: Joi.string().min(8).max(100).required().messages({
    'string.base': 'Password must be a string',
    'string.empty': 'Password is required',
    'string.min': 'Password should have at least 8 characters',
    'string.max': 'Password should not exceed 100 characters',
    'any.required': 'Password is a required field',
  }),
  phone: Joi.string()
    .pattern(/^(?:\+233|0)[245][0-9]{8}$/)
    .required()
    .messages({
      'string.pattern.base':
        'Phone number must be a valid Ghanaian number (e.g., 0241234567 or +233241234567)',
    }),
});

const sellerAuthSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Name must be a string',
    'string.empty': 'Name is required',
    'string.min': 'Name should have at least 2 characters',
    'string.max': 'Name should not exceed 50 characters',
    'any.required': 'Name is a required field',
  }),
  email: Joi.string()
    .email()
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.pattern.base':
        'Email must be a valid email address (e.g., example@domain.com)',
    }),
  password: Joi.string().min(8).max(100).required().messages({
    'string.base': 'Password must be a string',
    'string.empty': 'Password is required',
    'string.min': 'Password should have at least 8 characters',
    'string.max': 'Password should not exceed 100 characters',
    'any.required': 'Password is a required field',
  }),
  storeName: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Store name must be a string',
    'string.empty': 'Store name is required',
    'string.min': 'Store name should have at least 2 characters',
    'string.max': 'Store name should not exceed 50 characters',
    'any.required': 'Store name is a required field',
  }),
  address: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Address must be a string',
    'string.empty': 'Address is required',
    'string.min': 'Address should have at least 2 characters',
    'string.max': 'Address should not exceed 50 characters',
    'any.required': 'Address is a required field',
  }),
  phone: Joi.string()
    .pattern(/^(?:\+233|0)[245][0-9]{8}$/)
    .required()
    .messages({
      'string.pattern.base':
        'Phone number must be a valid Ghanaian number (e.g., 0241234567 or +233241234567)',
    }),
});

const suLoginSchema = Joi.object({
  email: Joi.string()
    .email()
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .optional()
    .messages({
      'string.email':
        'Please provide a valid email address (e.g., example@domain.com)',
      'string.pattern.base':
        'Email must be a valid email address (e.g., example@domain.com)',
    }),
  phone: Joi.string()
    .pattern(/^(?:\+233|0)[245][0-9]{8}$/)
    .optional()
    .messages({
      'string.pattern.base':
        'Phone number must be a valid Ghanaian number (e.g., 0241234567 or +233241234567)',
    }),
  password: Joi.string().min(8).max(100).required().messages({
    'string.base': 'Password must be a string',
    'string.empty': 'Password is required',
    'string.min': 'Password should have at least 8 characters',
    'string.max': 'Password should not exceed 100 characters',
    'any.required': 'Password is a required field',
  }),
}).or('email', 'phone');

module.exports = {
  sellerAuthSchema,
  suLoginSchema,
  userAuthSchema,
  adminAuthSchema,
};
