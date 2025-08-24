const express = require('express');
const nigreviewController = require('../../controllers/nigpost/review.controller');
const { upload } = require('../../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), nigreviewController.createReview);
router.patch(
  '/:id',
  upload.single('image_url'),
  nigreviewController.updateReview
);
router.get('/', nigreviewController.getAllReviews);
router.get('/tag/:tag', nigreviewController.getReviewsByTag);
router.get('/venue/:venue', nigreviewController.getReviewsByVenue);
router.get('/:slug', nigreviewController.getSingleReview);
router.delete('/:id', nigreviewController.deleteReview);

module.exports = router;
