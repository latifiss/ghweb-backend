const express = require('express');
const { register, login } = require('../controllers/adminAuth.controller.js');

const router = express.Router();

router.post('/admin/register', register);

router.post('/admin/login', login);

module.exports = router;
