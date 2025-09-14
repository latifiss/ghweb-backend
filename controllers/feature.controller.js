const Feature = require('../models/feature.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');
const { getRedisClient } = require('../lib/redis');

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

const invalidateFeatureCache = async () => {
  await Promise.all([
    deleteCacheByPattern('features:*'),
    deleteCacheByPattern('feature:*'),
    deleteCacheByPattern('tag:*'),
    deleteCacheByPattern('venue:*'),
  ]);
};

exports.createFeature = async (req, res) => {
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
        'features'
      );
    }

    const feature = new Feature({
      title,
      description,
      content,
      rating: rating || 0,
      label,
      venue,
      tags: tags || '',
      published_at: new Date(published_at),
      creator,
      ...(imageUrl && { image_url: imageUrl }),
    });

    await feature.save();

    await invalidateFeatureCache();

    res.status(201).json({
      status: 'success',
      data: {
        feature,
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

exports.updateFeature = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = req.body;

    const existingFeature = await Feature.findOne({ slug: slug });
    if (!existingFeature) {
      return res.status(404).json({
        status: 'fail',
        message: 'Feature not found',
      });
    }

    if (req.file) {
      if (existingFeature.image_url) {
        await deleteFromR2(existingFeature.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'features'
      );
    }

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const feature = await Feature.findOneAndUpdate({ slug: slug }, updateData, {
      new: true,
      runValidators: true,
    });

    await Promise.all([
      deleteCacheByPattern(`feature:${feature.slug}`),
      deleteCacheByPattern(`feature:${feature._id}`),
      deleteCacheByPattern('features:list:*'),
      invalidateFeatureCache(),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        feature,
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

exports.getSingleFeature = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `feature:${slug}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const feature = await Feature.findOne({ slug });

    if (!feature) {
      return res.status(404).json({
        status: 'fail',
        message: 'Feature not found',
      });
    }

    const responseData = {
      feature,
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

exports.getAllFeatures = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('features:list', { page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [features, total] = await Promise.all([
      Feature.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Feature.countDocuments(),
    ]);

    const responseData = {
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
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

exports.getFeaturesByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('tag:features', { tag, page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [features, total] = await Promise.all([
      Feature.find({ tags: tag })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Feature.countDocuments({ tags: tag }),
    ]);

    const responseData = {
      tag,
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
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

exports.getFeaturesByVenue = async (req, res) => {
  try {
    const { venue } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('venue:features', { venue, page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [features, total] = await Promise.all([
      Feature.find({ venue })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Feature.countDocuments({ venue }),
    ]);

    const responseData = {
      venue,
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
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

exports.deleteFeature = async (req, res) => {
  try {
    const { id } = req.params;
    const feature = await Feature.findByIdAndDelete(id);

    if (!feature) {
      return res.status(404).json({
        status: 'fail',
        message: 'Feature not found',
      });
    }

    if (feature.image_url) {
      await deleteFromR2(feature.image_url);
    }

    await invalidateFeatureCache();

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
