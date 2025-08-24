const express = require('express');
const feedController = require('../../controllers/spf/feed.controller');

const router = express.Router();

router.get('/', feedController.getFeed);

router.get('/categories/:category', feedController.getFeedByCategory);

router.get('/tags/:tag', feedController.getFeedByTags);

module.exports = router;
