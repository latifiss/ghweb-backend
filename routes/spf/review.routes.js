const express = require('express');
const spfreviewController = require('../../controllers/spf/review.controller');
const { upload } = require('../../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), spfreviewController.createReview);
router.patch(
  '/:id',
  upload.single('image_url'),
  spfreviewController.updateReview
);
router.get('/', spfreviewController.getAllReviews);
router.get('/tag/:tag', spfreviewController.getReviewsByTag);
router.get('/venue/:venue', spfreviewController.getReviewsByVenue);
router.get('/:slug', spfreviewController.getSingleReview);
router.delete('/:id', spfreviewController.deleteReview);

module.exports = router;
