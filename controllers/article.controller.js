const { Article } = require('../models/article.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');

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

    if (isHeadline) {
      await Article.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
    }

    const article = new Article({
      title,
      description,
      content: isLive
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
        : content,
      category: Array.isArray(category) ? category : [category],
      tags: tags || [],
      isLive: isLive || false,
      isBreaking: isBreaking || false,
      isHeadline: isHeadline || false,
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

    res.status(201).json({
      status: 'success',
      data: {
        article,
      },
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
    const { id } = req.params;
    const updateData = req.body;

    const existingArticle = await Article.findById(id);
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
      if (existingArticle.content?.[0]?.content_image_url) {
        await deleteFromR2(existingArticle.content[0].content_image_url);
      }
      updateData.content = existingArticle.content.map((item, index) => {
        if (index === 0) {
          return {
            ...item,
            content_image_url: req.files.contentThumbnail[0].buffer
              ? uploadToR2(
                  req.files.contentThumbnail[0].buffer,
                  req.files.contentThumbnail[0].mimetype,
                  'articles'
                )
                  .then((url) => url)
                  .catch((err) => console.error(err))
              : item.content_image_url,
          };
        }
        return item;
      });
    }

    if (updateData.isHeadline) {
      await Article.updateMany(
        { isHeadline: true },
        { $set: { isHeadline: false } }
      );
    }

    if (updateData.wasLive) {
      updateData.isLive = false;
    }

    if (updateData.title) {
      updateData.meta_title = Article.prototype.generateMetaTitle(
        updateData.title
      );
    }

    if (updateData.description) {
      updateData.meta_description = Article.prototype.generateMetaDescription({
        title: updateData.title || existingArticle.title,
        description: updateData.description,
      });
    }

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const article = await Article.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      status: 'success',
      data: {
        article,
      },
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

    const [articles, total] = await Promise.all([
      Article.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Article.countDocuments(),
    ]);

    res.status(200).json({
      status: 'success',
      results: articles.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        articles,
      },
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
    const { id } = req.params;
    const article = await Article.findOne({
      $or: [{ _id: id }, { slug: id }],
    });

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const keyEvents = article.isLive
      ? article.content.filter((item) => item.isKey)
      : null;

    const response = {
      ...article.toObject(),
      keyEvents,
    };

    res.status(200).json({
      status: 'success',
      data: response,
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
    const { id } = req.params;
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({
        status: 'fail',
        message: 'Article not found',
      });
    }

    const similarArticles = await Article.find({
      tags: { $in: article.tags },
      _id: { $ne: article._id },
    }).limit(5);

    res.status(200).json({
      status: 'success',
      data: {
        articles: similarArticles,
      },
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

    const [articles, total] = await Promise.all([
      Article.find({ category })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Article.countDocuments({ category }),
    ]);

    res.status(200).json({
      status: 'success',
      category,
      results: articles.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        articles,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
