const express = require('express');
const nigarticleController = require('../../controllers/nigpost/article.controller');
const { uploadMultiple } = require('../../utils/multer');

const router = express.Router();

router.post(
  '/',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  nigarticleController.createArticle
);
router.put(
  '/:id',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  nigarticleController.updateArticle
);
router.get('/', nigarticleController.getArticles);
router.get('/headline', nigarticleController.getHeadline);
router.get(
  '/category-headline/:category',
  nigarticleController.getCategoryHeadline
);
router.get('/similar/:slug', nigarticleController.getSimilarArticles);
router.get('/category/:category', nigarticleController.getArticlesByCategory);
router.get('/:slug', nigarticleController.getArticleById);

router.post(
  '/:id/live-updates',
  uploadMultiple.fields([{ name: 'contentThumbnail', maxCount: 1 }]),
  nigarticleController.addLiveUpdate
);
router.patch('/:id/end-live', nigarticleController.endLiveArticle);
router.patch('/:id/mark-key/:updateId', nigarticleController.markAsKeyEvent);

router.delete('/:id', nigarticleController.deleteArticle);

module.exports = router;
