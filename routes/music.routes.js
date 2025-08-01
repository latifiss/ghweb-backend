const express = require('express');
const musicController = require('../controllers/music.controller');
const router = express.Router();
const { upload } = require('../utils/multer');

router.post('/', upload.single('image_url'), musicController.createMusic);
router.patch('/:id', upload.single('image_url'), musicController.updateMusic);
router.get('/', musicController.getAllMusic);
router.get('/genre/:genre', musicController.getAllMusicByGenre);
router.get('/:id', musicController.getSingleMusic);

module.exports = router;
