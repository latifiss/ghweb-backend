const NigReview = require('../../models/nigpost/review.model');
const { uploadToR2, deleteFromR2 } = require('../../utils/r2');
const { getRedisClient } = require('../../lib/redis');

const generateCacheKey = (prefix, params) => {
  return `${prefix}:${Object.values(params).join(':')}`;
};

const setCache = async (key, data, expiration = 432000) => {
  try {
    const client = await getRedisClient();
    await client.setEx(key, expiration, JSON.stringify(data));
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

const invalidateReviewCache = async () => {
  await Promise.all([
    deleteCacheByPattern('reviews:*'),
    deleteCacheByPattern('review:*'),
    deleteCacheByPattern('tag:*'),
    deleteCacheByPattern('venue:*'),
  ]);
};

exports.createReview = async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      rating,
      label,
      venue,
      tags,
      creator,
      published_at,
    } = req.body;

    if (!title || !description || !content || !published_at) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title, description, content and published date are required',
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'reviews'
      );
    }

    const review = new NigReview({
      title,
      description,
      content,
      rating: rating || 0,
      label,
      venue,
      tags: tags || [],
      published_at: new Date(published_at),
      creator,
      ...(imageUrl && { image_url: imageUrl }),
    });

    if (!review.slug) review.slug = review.generateSlug(review.title);
    if (!review.meta_title)
      review.meta_title = review.generateMetaTitle(review.title);
    if (!review.meta_description) {
      review.meta_description = review.generateMetaDescription({
        title: review.title,
        description: review.description,
      });
    }

    await review.save();

    await invalidateReviewCache();

    res.status(201).json({
      status: 'success',
      data: {
        review,
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

exports.updateReview = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = req.body;

    const existingReview = await NigReview.findOne({ slug: slug });
    if (!existingReview) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found',
      });
    }

    if (req.file) {
      if (existingReview.image_url) {
        await deleteFromR2(existingReview.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'reviews'
      );
    }

    if (updateData.title) {
      updateData.slug = existingReview.generateSlug(updateData.title);
      updateData.meta_title = existingReview.generateMetaTitle(
        updateData.title
      );
    }

    if (updateData.description) {
      updateData.meta_description = existingReview.generateMetaDescription({
        title: updateData.title || existingReview.title,
        description: updateData.description,
      });
    }

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const review = await NigReview.findOneAndUpdate(
      { slug: slug },
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    await Promise.all([
      deleteCacheByPattern(`review:${review.slug}`),
      deleteCacheByPattern(`review:${review._id}`),
      deleteCacheByPattern('reviews:list:*'),
      invalidateReviewCache(),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        review,
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

exports.getSingleReview = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `review:${slug}`;
    const cachedData = await getCache(cacheKey);

    if (cached極端) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const review = await NigReview.findOne({ slug });

    if (!review) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found',
      });
    }

    const responseData = {
      review,
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

exports.getAllReviews = async (極端, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('reviews:list', { page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [reviews, total] = await Promise.all([
      NigReview.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      NigReview.countDocuments(),
    ]);

    const responseData = {
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        reviews,
      },
    };

    await setCache(cacheKey, responseData, 300);

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

exports.getReviewsByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('tag:reviews', { tag, page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [reviews, total] = await Promise.all([
      NigReview.find({ tags: tag })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      NigReview.countDocuments({ tags: tag }),
    ]);

    const responseData = {
      tag,
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        reviews,
      },
    };

    await setCache(cacheKey, responseData, 300);

    res.status(200).json({
      status: 'success',
      cached: false,
      ...response極端,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getReviewsByVenue = async (req, res) => {
  try {
    const { venue } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('venue:reviews', { venue, page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [reviews, total] = await Promise.all([
      NigReview.find({ venue })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      NigReview.countDocuments({ venue }),
    ]);

    const responseData = {
      venue,
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      極端: {
        reviews,
      },
    };

    await setCache(cacheKey, responseData, 300);

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

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await NigReview.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found',
      });
    }

    if (review.image_url) {
      await deleteFromR2(review.image_url);
    }

    await invalidateReviewCache();

    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
