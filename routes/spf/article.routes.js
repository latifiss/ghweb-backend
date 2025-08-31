const express = require('express');
const spfarticleController = require('../../controllers/spf/article.controller');
const { uploadMultiple } = require('../../utils/multer');

const router = express.Router();

router.post(
  '/',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  spfarticleController.createArticle
);
router.put(
  '/:slug',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  spfarticleController.updateArticle
);
router.get('/', spfarticleController.getArticles);
router.get('/headline', spfarticleController.getHeadline);
router.get(
  '/category-headline/:category',
  spfarticleController.getCategoryHeadline
);
router.get('/similar/:slug', spfarticleController.getSimilarArticles);
router.get('/category/:category', spfarticleController.getArticlesByCategory);
router.get('/:slug', spfarticleController.getArticleById);

router.post(
  '/:id/live-updates',
  uploadMultiple.fields([{ name: 'contentThumbnail', maxCount: 1 }]),
  spfarticleController.addLiveUpdate
);
router.patch('/:id/end-live', spfarticleController.endLiveArticle);
router.patch('/:id/mark-key/:updateId', spfarticleController.markAsKeyEvent);

router.delete('/:id', spfarticleController.deleteArticle);

module.exports = router;
