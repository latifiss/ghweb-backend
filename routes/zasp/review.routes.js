const express = require('express');
const zaspreviewController = require('../../controllers/zasp/review.controller');
const { upload } = require('../../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), zaspreviewController.createReview);
router.patch(
  '/:slug',
  upload.single('image_url'),
  zaspreviewController.updateReview
);
router.get('/', zaspreviewController.getAllReviews);
router.get('/tag/:tag', zaspreviewController.getReviewsByTag);
router.get('/venue/:venue', zaspreviewController.getReviewsByVenue);
router.get('/:slug', zaspreviewController.getSingleReview);
router.delete('/:id', zaspreviewController.deleteReview);

module.exports = router;
