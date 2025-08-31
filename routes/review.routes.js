const express = require('express');
const reviewController = require('../controllers/review.controller');
const { upload } = require('../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), reviewController.createReview);
router.put('/:slug', upload.single('image_url'), reviewController.updateReview);
router.get('/', reviewController.getAllReviews);
router.get('/tag/:tag', reviewController.getReviewsByTag);
router.get('/venue/:venue', reviewController.getReviewsByVenue);
router.get('/:slug', reviewController.getSingleReview);
router.delete('/:id', reviewController.deleteReview);

module.exports = router;
