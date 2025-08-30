const express = require('express');
const zasparticleController = require('../../controllers/zasp/article.controller');
const { uploadMultiple } = require('../../utils/multer');

const router = express.Router();

router.post(
  '/',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  zasparticleController.createArticle
);
router.put(
  '/:slug',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  zasparticleController.updateArticle
);
router.get('/', zasparticleController.getArticles);
router.get('/headline', zasparticleController.getHeadline);
router.get(
  '/category-headline/:category',
  zasparticleController.getCategoryHeadline
);
router.get('/similar/:slug', zasparticleController.getSimilarArticles);
router.get('/category/:category', zasparticleController.getArticlesByCategory);
router.get('/:slug', zasparticleController.getArticleById);

router.post(
  '/:id/live-updates',
  uploadMultiple.fields([{ name: 'contentThumbnail', maxCount: 1 }]),
  zasparticleController.addLiveUpdate
);
router.patch('/:id/end-live', zasparticleController.endLiveArticle);
router.patch('/:id/mark-key/:updateId', zasparticleController.markAsKeyEvent);

router.delete('/:id', zasparticleController.deleteArticle);

module.exports = router;
