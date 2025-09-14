const { ZaspArticle } = require('../../models/zasp/article.model');
const { uploadToR2, deleteFromR2 } = require('../../utils/r2');
const { getRedisClient } = require('../../lib/redis');

const generateCacheKey = (prefix, params) => {
  return `${prefix}:${Object.values(params).join(':')}`;
};

const setCache = async (key, data, expiration = 432000) => {
  try {
    const client = await getRedisClient();
    await client.setEx(key, expiration, JSON.stringify(data));
  } catch (err) {}
};

const getCache = async (key) => {
  try {
    const client = await getRedisClient();
    const cachedData = await client.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (err) {
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
  } catch (err) {}
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

    try {
      if (req.files?.articleThumbnail) {
        imageUrl = await uploadToR2(
          req.files.articleThumbnail[0].buffer,
          req.files.articleThumbnail[0].mimetype,
          'articles'
        );
      }

      if (req.files?.contentThumbnail) {
        contentImageUrl = await uploadToR2(
          req.files.contentThumbnail[0].buffer,
          req.files.contentThumbnail[0].mimetype,
          'articles'
        );
      }
    } catch {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload image(s)',
      });
    }

    if (isHeadline) {
      await ZaspArticle.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
      await deleteCacheByPattern('headline:*');
    }

    if (isCategoryHeadline && category) {
      const cats = Array.isArray(category) ? category : [category];
      await ZaspArticle.updateMany(
        { category: { $in: cats }, isCategoryHeadline: true },
        { $set: { isCategoryHeadline: false } }
      );
      for (const cat of cats) {
        await deleteCacheByPattern(`category:headline:${cat}`);
      }
    }

    const articleContent = isLive
      ? [
          {
            content_title: title,
            content_description: description,
            content_detail: content,
            content_image_url: contentImageUrl || imageUrl,
            content_published_at: new Date(published_at),
            isKey: false,
          },
        ]
      : content;

    const article = new ZaspArticle({
      title,
      description,
      content: articleContent,
      category: Array.isArray(category) ? category : [category],
      tags: tags || '',
      isLive: !!isLive,
      isBreaking: !!isBreaking,
      isHeadline: !!isHeadline,
      isCategoryHeadline: !!isCategoryHeadline,
      label,
      published_at: new Date(published_at),
      image_url: imageUrl,
      meta_title: ZaspArticle.prototype.generateMetaTitle(title),
      meta_description: ZaspArticle.prototype.generateMetaDescription({
        title,
        description,
      }),
    });

    const validationError = article.validateSync();
    if (validationError) {
      const errors = {};
      Object.keys(validationError.errors).forEach((key) => {
        errors[key] = validationError.errors[key].message;
      });
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed',
        errors,
      });
    }

    await article.save();
    await invalidateArticleCache();

    res.status(201).json({
      status: 'success',
      data: { article },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Slug must be unique',
      });
    }
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.updateArticle = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = { ...req.body };

    const existingArticle = await ZaspArticle.findOne({ slug });
    if (!existingArticle) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    if (req.files?.articleThumbnail) {
      if (existingArticle.image_url) {
        await deleteFromR2(existingArticle.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.files.articleThumbnail[0].buffer,
        req.files.articleThumbnail[0].mimetype,
        'articles'
      );
    }

    if (req.files?.contentThumbnail) {
      const contentImageUrl = await uploadToR2(
        req.files.contentThumbnail[0].buffer,
        req.files.contentThumbnail[0].mimetype,
        'articles'
      );
      updateData.content = existingArticle.content.map((item, index) =>
        index === 0 ? { ...item, content_image_url: contentImageUrl } : item
      );
    }

    if (updateData.isHeadline && !existingArticle.isHeadline) {
      await ZaspArticle.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
      await deleteCacheByPattern('headline:*');
    } else if (existingArticle.isHeadline && !updateData.isHeadline) {
      delete updateData.isHeadline;
    }

    if (updateData.isCategoryHeadline && existingArticle.category) {
      await ZaspArticle.updateMany(
        {
          category: { $in: existingArticle.category },
          isCategoryHeadline: true,
        },
        { $set: { isCategoryHeadline: false } }
      );
      for (const cat of existingArticle.category) {
        await deleteCacheByPattern(`category:headline:${cat}`);
      }
    } else if (existingArticle.isCategoryHeadline) {
      delete updateData.isCategoryHeadline;
    }

    if (updateData.isBreaking && !existingArticle.isBreaking) {
      updateData.breakingExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    } else if (updateData.isBreaking === false) {
      updateData.breakingExpiresAt = null;
    }

    if (updateData.wasLive) {
      updateData.isLive = false;
    }

    if (updateData.title) {
      updateData.meta_title = ZaspArticle.prototype.generateMetaTitle(
        updateData.title
      );
    }

    if (updateData.description) {
      updateData.meta_description =
        ZaspArticle.prototype.generateMetaDescription({
          title: updateData.title || existingArticle.title,
          description: updateData.description,
        });
    }

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const article = await ZaspArticle.findOneAndUpdate({ slug }, updateData, {
      new: true,
      runValidators: true,
    });

    await Promise.all([
      deleteCacheByPattern(`article:${article.slug}`),
      deleteCacheByPattern(`article:${article._id}`),
      deleteCacheByPattern('articles:list:*'),
      invalidateArticleCache(),
    ]);

    res.status(200).json({
      status: 'success',
      data: { article },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Slug must be unique',
      });
    }
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getHeadline = async (req, res) => {
  try {
    const headlineArticle = await ZaspArticle.findOne({
      isHeadline: true,
    }).sort({ published_at: -1 });
    if (!headlineArticle) {
      return res
        .status(404)
        .json({ status: 'fail', message: 'No headline article found' });
    }

    const similarArticles = await ZaspArticle.find({
      tags: { $in: headlineArticle.tags || [] },
      isHeadline: false,
    })
      .sort({ published_at: -1 })
      .limit(3);

    const responseData = { headline: headlineArticle, similarArticles };
    await setCache('headline:main', responseData, 432000);

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
    const categoryHeadline = await ZaspArticle.findOne({
      category: { $in: [category] },
      isCategoryHeadline: true,
    }).sort({ published_at: -1 });

    if (!categoryHeadline) {
      return res
        .status(404)
        .json({ status: 'fail', message: 'No category headline found' });
    }

    const similarArticles = await ZaspArticle.find({
      category: { $in: [category] },
      isCategoryHeadline: false,
      _id: { $ne: categoryHeadline._id },
    })
      .sort({ published_at: -1 })
      .limit(3);

    const responseData = { categoryHeadline, similarArticles };
    await setCache(`category:headline:${category}`, responseData, 432000);

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

    const article = await ZaspArticle.findById(id);
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

    const article = await ZaspArticle.findById(id);
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

    const article = await ZaspArticle.findByIdAndUpdate(
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
      ZaspArticle.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      ZaspArticle.countDocuments(),
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

    const article = await ZaspArticle.findOne({ slug });

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

    const article = await ZaspArticle.findOne({ slug });

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const similarArticles = await ZaspArticle.find({
      tags: { $in: article.tags },
      slug: { $ne: article.slug },
    }).limit(5);

    const responseData = {
      articles: similarArticles,
    };

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
      ZaspArticle.find({ category })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      ZaspArticle.countDocuments({ category }),
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

exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await ZaspArticle.findById(id);
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
