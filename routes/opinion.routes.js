const express = require('express');
const opinionController = require('../controllers/opinion.controller');
const { upload } = require('../utils/multer');

const router = express.Router();

router.post('/', upload.single('image_url'), opinionController.createOpinion);
router.patch(
  '/:id',
  upload.single('image_url'),
  opinionController.updateOpinion
);
router.get('/', opinionController.getAllOpinions);
router.get('/tag/:tag', opinionController.getOpinionsByTag);
router.get('/:slug', opinionController.getSingleOpinion);
router.delete('/:id', opinionController.deleteOpinion);

module.exports = router;
