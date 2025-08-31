const express = require('express');
const movieController = require('../controllers/movie.controller.js');
const { upload } = require('../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), movieController.createMovie);
router.put('/:slug', upload.single('image_url'), movieController.updateMovie);
router.get('/', movieController.getAllMovies);
router.get('/genre/:genre', movieController.getMoviesByGenre);
router.get('/:slug', movieController.getSingleMovie);
router.delete('/:id', movieController.deleteMovie);

module.exports = router;
