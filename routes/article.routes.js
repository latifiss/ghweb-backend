const express = require('express');
const articleController = require('../controllers/article.controller');
const { uploadMultiple } = require('../utils/multer');

const router = express.Router();

router.post(
  '/',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  articleController.createArticle
);
router.put(
  '/:id',
  uploadMultiple.fields([
    { name: 'articleThumbnail', maxCount: 1 },
    { name: 'contentThumbnail', maxCount: 1 },
  ]),
  articleController.updateArticle
);
router.get('/', articleController.getArticles);
router.get('/headline', articleController.getHeadline);
router.get(
  '/category-headline/:category',
  articleController.getCategoryHeadline
);
router.get('/similar/:slug', articleController.getSimilarArticles);
router.get('/category/:category', articleController.getArticlesByCategory);
router.get('/:slug', articleController.getArticleById);

router.post(
  '/:id/live-updates',
  uploadMultiple.fields([{ name: 'contentThumbnail', maxCount: 1 }]),
  articleController.addLiveUpdate
);
router.patch('/:id/end-live', articleController.endLiveArticle);
router.patch('/:id/mark-key/:updateId', articleController.markAsKeyEvent);

router.delete('/:id', articleController.deleteArticle);

module.exports = router;
