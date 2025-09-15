const { Article } = require('../models/article.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');
const { getRedisClient } = require('../lib/redis');
const rankArticle = require('../utils/rankArticle');

const generateCacheKey = (prefix, params) => {
  return `${prefix}:${Object.values(params).join(':')}`;
};

const setCache = async (key, data, expiration = 432000) => {
  try {
    const client = await getRedisClient();
    if (expiration === null) {
      await client.set(key, JSON.stringify(data));
    } else {
      await client.setEx(key, expiration, JSON.stringify(data));
    }
  } catch (err) {
    console.error('Redis set error:', err);
  }
};

const getCache = async (key) => {
  try {
    const client = await getRedisClient();
    const cachedData = await client.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (err) {
    console.error('Redis get error:', err);
    return null;
  }
};

const deleteCacheByPattern = async (pattern) => {
  try {
    const client = await getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (err) {
    console.error('Redis delete error:', err);
  }
};

const invalidateArticleCache = async () => {
  await Promise.all([
    deleteCacheByPattern('articles:*'),
    deleteCacheByPattern('headline:*'),
    deleteCacheByPattern('category:*'),
  ]);
};

exports.createArticle = async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      tags,
      isLive,
      isBreaking,
      isHeadline,
      isCategoryHeadline,
      label,
      published_at,
    } = req.body;

    if (!title || !description || !content || !published_at || !category) {
      return res.status(400).json({
        status: 'fail',
        message:
          'Title, description, content, category and published date are required',
      });
    }

    let imageUrl = null;
    let contentImageUrl = null;

    if (req.files?.articleThumbnail?.[0]) {
      imageUrl = await uploadToR2(
        req.files.articleThumbnail[0].buffer,
        req.files.articleThumbnail[0].mimetype,
        'articles'
      );
    }

    if (req.files?.contentThumbnail?.[0]) {
      contentImageUrl = await uploadToR2(
        req.files.contentThumbnail[0].buffer,
        req.files.contentThumbnail[0].mimetype,
        'articles'
      );
    }

    if (isHeadline) {
      await Article.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
      await deleteCacheByPattern('headline:*');
    }

    if (isCategoryHeadline && category) {
      const categories = Array.isArray(category) ? category : [category];
      await Article.updateMany(
        { category: { $in: categories }, isCategoryHeadline: true },
        { $set: { isCategoryHeadline: false } }
      );
      await Promise.all(
        categories.map((cat) =>
          deleteCacheByPattern(`category:headline:${cat}`)
        )
      );
    }

    let articleContent;
    if (isLive) {
      articleContent = [
        {
          content_title: title,
          content_description: description,
          content_detail: content,
          content_image_url: contentImageUrl || imageUrl,
          content_published_at: new Date(published_at),
          isKey: false,
        },
      ];
    } else {
      articleContent = content;
    }

    const article = new Article({
      title,
      description,
      content: articleContent,
      category: Array.isArray(category) ? category : [category],
      tags: tags || '',
      isLive: isLive || false,
      isBreaking: isBreaking || false,
      isHeadline: isHeadline || false,
      isCategoryHeadline: isCategoryHeadline || false,
      label,
      published_at: new Date(published_at),
      image_url: imageUrl,
      meta_title: Article.prototype.generateMetaTitle(title),
      meta_description: Article.prototype.generateMetaDescription({
        title,
        description,
      }),
    });

    await article.save();
    await invalidateArticleCache();

    if (isHeadline) {
      const responseData = { headline: article, similarArticles: [] };
      await setCache('headline:main', responseData, null);
    }

    if (isCategoryHeadline) {
      const categories = Array.isArray(category) ? category : [category];
      for (const cat of categories) {
        const responseData = { categoryHeadline: article, similarArticles: [] };
        await setCache(`category:headline:${cat}`, responseData, null);
      }
    }

    res.status(201).json({ status: 'success', data: { article } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Slug must be unique',
      });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.updateArticle = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = { ...req.body };
    const existingArticle = await Article.findOne({ slug });

    if (!existingArticle) {
      return res
        .status(404)
        .json({ status: 'fail', message: 'Article not found' });
    }

    if (req.files?.articleThumbnail?.[0]) {
      if (existingArticle.image_url) {
        await deleteFromR2(existingArticle.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.files.articleThumbnail[0].buffer,
        req.files.articleThumbnail[0].mimetype,
        'articles'
      );
    }

    if (req.files?.contentThumbnail?.[0]) {
      if (existingArticle.content?.[0]?.content_image_url) {
        await deleteFromR2(existingArticle.content[0].content_image_url);
      }
      const newContentImageUrl = await uploadToR2(
        req.files.contentThumbnail[0].buffer,
        req.files.contentThumbnail[0].mimetype,
        'articles'
      );
      updateData.content = existingArticle.content.map((item, index) => {
        if (index === 0)
          return { ...item, content_image_url: newContentImageUrl };
        return item;
      });
    }

    if (updateData.isHeadline && !existingArticle.isHeadline) {
      await Article.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
      updateData.isHeadline = true;
      await deleteCacheByPattern('headline:*');
    } else if (existingArticle.isHeadline && !updateData.isHeadline) {
      delete updateData.isHeadline;
    }

    if (updateData.isCategoryHeadline && !existingArticle.isCategoryHeadline) {
      const categories = Array.isArray(existingArticle.category)
        ? existingArticle.category
        : [existingArticle.category];
      await Article.updateMany(
        { category: { $in: categories }, isCategoryHeadline: true },
        { $set: { isCategoryHeadline: false } }
      );
      updateData.isCategoryHeadline = true;
      await Promise.all(
        categories.map((cat) =>
          deleteCacheByPattern(`category:headline:${cat}`)
        )
      );
    } else if (existingArticle.isCategoryHeadline) {
      delete updateData.isCategoryHeadline;
    }

    const article = await Article.findOneAndUpdate({ slug }, updateData, {
      new: true,
      runValidators: true,
    });

    await invalidateArticleCache();

    if (article.isHeadline) {
      const responseData = { headline: article, similarArticles: [] };
      await setCache('headline:main', responseData, null);
    }

    if (article.isCategoryHeadline) {
      for (const cat of article.category) {
        const responseData = { categoryHeadline: article, similarArticles: [] };
        await setCache(`category:headline:${cat}`, responseData, null);
      }
    }

    res.status(200).json({ status: 'success', data: { article } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getHeadline = async (req, res) => {
  try {
    const cacheKey = 'headline:main';
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res
        .status(200)
        .json({ status: 'success', cached: true, data: cachedData });
    }
    const headlineArticle = await Article.findOne({ isHeadline: true }).sort({
      published_at: -1,
    });
    if (!headlineArticle) {
      return res
        .status(404)
        .json({ status: 'fail', message: 'No headline article found' });
    }
    const similarArticles = await Article.find({
      tags: { $in: headlineArticle.tags || [] },
      isHeadline: false,
    })
      .sort({ published_at: -1 })
      .limit(3);
    const responseData = { headline: headlineArticle, similarArticles };
    await setCache(cacheKey, responseData, null);
    res
      .status(200)
      .json({ status: 'success', cached: false, data: responseData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getCategoryHeadline = async (req, res) => {
  try {
    const { category } = req.params;
    const cacheKey = `category:headline:${category}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res
        .status(200)
        .json({ status: 'success', cached: true, data: cachedData });
    }
    const categoryHeadline = await Article.findOne({
      category: { $in: [category] },
      isCategoryHeadline: true,
    }).sort({ published_at: -1 });
    if (!categoryHeadline) {
      return res
        .status(404)
        .json({ status: 'fail', message: 'No category headline found' });
    }
    const similarArticles = await Article.find({
      category: { $in: [category] },
      isCategoryHeadline: false,
      _id: { $ne: categoryHeadline._id },
    })
      .sort({ published_at: -1 })
      .limit(3);
    const responseData = { categoryHeadline, similarArticles };
    await setCache(cacheKey, responseData, null);
    res
      .status(200)
      .json({ status: 'success', cached: false, data: responseData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.addLiveUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { content_title, content_description, content_detail, isKey } =
      req.body;

    if (!content_title || !content_description || !content_detail) {
      return res.status(400).json({
        status: 'fail',
        message: 'Content title, description and detail are required',
      });
    }

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    if (!article.isLive) {
      return res.status(400).json({
        status: 'fail',
        message: 'Article is not live',
      });
    }

    let content_image_url = null;
    if (req.file) {
      content_image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'articles'
      );
    }

    const liveUpdate = {
      content_title,
      content_description,
      content_detail,
      content_image_url,
      content_published_at: new Date(),
      isKey: isKey || false,
    };

    article.content.push(liveUpdate);

    await article.save();

    // Invalidate cache for this article
    await Promise.all([
      deleteCacheByPattern(`article:${article.slug}`),
      deleteCacheByPattern(`article:${article._id}`),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        update: article.content[article.content.length - 1],
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.markAsKeyEvent = async (req, res) => {
  try {
    const { id, updateId } = req.params;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const updateIndex = article.content.findIndex(
      (item) => item._id.toString() === updateId
    );

    if (updateIndex === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Update not found',
      });
    }

    article.content[updateIndex].isKey = true;
    await article.save();

    await Promise.all([
      deleteCacheByPattern(`article:${article.slug}`),
      deleteCacheByPattern(`article:${article._id}`),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        keyEvent: article.content[updateIndex],
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.endLiveArticle = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findByIdAndUpdate(
      id,
      { isLive: false, wasLive: true },
      { new: true }
    );

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    // Invalidate cache for this article
    await Promise.all([
      deleteCacheByPattern(`article:${article.slug}`),
      deleteCacheByPattern(`article:${article._id}`),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        article,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getArticles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('articles:list', { page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [articles, total] = await Promise.all([
      Article.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Article.countDocuments(),
    ]);

    const responseData = {
      results: articles.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        articles,
      },
    };

    await setCache(cacheKey, responseData, 432000);

    res.status(200).json({
      status: 'success',
      cached: false,
      ...responseData,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getArticleById = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `article:${slug}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const article = await Article.findOne({ slug });

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const keyEvents = article.isLive
      ? article.content.filter((item) => item.isKey)
      : null;

    const responseData = {
      ...article.toObject(),
      keyEvents,
    };

    // Cache for 1 hour
    await setCache(cacheKey, responseData, 3600);

    res.status(200).json({
      status: 'success',
      cached: false,
      data: responseData,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getSimilarArticles = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `article:similar:${slug}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const article = await Article.findOne({ slug });

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const similarArticles = await Article.find({
      tags: { $in: article.tags },
      slug: { $ne: article.slug },
    }).limit(5);

    const responseData = {
      articles: similarArticles,
    };

    // Cache for 30 minutes
    await setCache(cacheKey, responseData, 1800);

    res.status(200).json({
      status: 'success',
      cached: false,
      data: responseData,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getArticlesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('articles:category', {
      category,
      page,
      limit,
    });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [articles, total] = await Promise.all([
      Article.find({ category })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Article.countDocuments({ category }),
    ]);

    const responseData = {
      category,
      results: articles.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        articles,
      },
    };

    await setCache(cacheKey, responseData, 432000);

    res.status(200).json({
      status: 'success',
      cached: false,
      ...responseData,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getArticleByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('articles:category', {
      category,
      page,
      limit,
    });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [articles, total] = await Promise.all([
      Article.find({ category, isHeadline: { $ne: true } })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Article.countDocuments({ category }),
    ]);

    const responseData = {
      category,
      results: articles.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        articles,
      },
    };

    await setCache(cacheKey, responseData, 432000);

    res.status(200).json({
      status: 'success',
      cached: false,
      ...responseData,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getNewsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const cacheKey = generateCacheKey('news:category', {
      category,
      page,
      limit,
    });
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res
        .status(200)
        .json({ status: 'success', cached: true, data: cachedData });
    }

    const now = new Date();
    const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

    const allArticles = await Article.find({
      category: { $in: [category] },
      $or: [{ isHeadline: { $ne: true } }, { isHeadline: { $exists: false } }],
    }).sort({ published_at: -1 });

    const total = allArticles.length;

    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });
      if (age > FRESHNESS_THRESHOLD) score *= 0.3;

      const articleObj = article.toObject();
      delete articleObj.isHeadline;

      return {
        ...articleObj,
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
        published_at: article.published_at,
      };
    });

    const rankedArticles = [...processedArticles].sort(
      (a, b) => b.score - a.score
    );

    const startIndex = (page - 1) * limit;
    const paginatedArticles = rankedArticles.slice(
      startIndex,
      startIndex + limit
    );

    const freshArticles = processedArticles.filter((a) => a.isFresh);

    const responseData = {
      articles: paginatedArticles,
      meta: {
        category,
        total,
        freshCount: freshArticles.length,
        page,
        totalPages: Math.ceil(total / limit),
        freshnessThreshold: '36 hours',
      },
    };

    await setCache(cacheKey, responseData, 432000);

    res
      .status(200)
      .json({ status: 'success', cached: false, data: responseData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    if (article.image_url) {
      await deleteFromR2(article.image_url);
    }

    if (Array.isArray(article.content)) {
      for (const contentBlock of article.content) {
        if (contentBlock.content_image_url) {
          await deleteFromR2(contentBlock.content_image_url);
        }
      }
    }

    await article.deleteOne();

    await invalidateArticleCache();

    res.status(200).json({
      status: 'success',
      message: 'Article deleted successfully',
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
