const express = require('express');
const featureController = require('../controllers/feature.controller');
const { upload } = require('../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), featureController.createFeature);
router.put(
  '/:slug',
  upload.single('image_url'),
  featureController.updateFeature
);
router.get('/', featureController.getAllFeatures);
router.get('/tag/:tag', featureController.getFeaturesByTag);
router.get('/venue/:venue', featureController.getFeaturesByVenue);
router.get('/:slug', featureController.getSingleFeature);
router.delete('/:id', featureController.deleteFeature);

module.exports = router;
