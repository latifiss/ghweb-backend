const Feature = require('../models/feature.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');

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
    const { id } = req.params;
    const updateData = req.body;

    const existingFeature = await Feature.findById(id);
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

    const feature = await Feature.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

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
    const { id } = req.params;
    const feature = await Feature.findOne({
      $or: [{ _id: id }, { slug: id }],
    });

    if (!feature) {
      return res.status(404).json({
        status: 'fail',
        message: 'Feature not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        feature,
      },
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

    const [features, total] = await Promise.all([
      Feature.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Feature.countDocuments(),
    ]);

    res.status(200).json({
      status: 'success',
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
      },
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

    const [features, total] = await Promise.all([
      Feature.find({ tags: tag })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Feature.countDocuments({ tags: tag }),
    ]);

    res.status(200).json({
      status: 'success',
      tag,
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
      },
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

    const [features, total] = await Promise.all([
      Feature.find({ venue })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Feature.countDocuments({ venue }),
    ]);

    res.status(200).json({
      status: 'success',
      venue,
      results: features.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        features,
      },
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
