const Review = require('../models/review.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');

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

    const review = new Review({
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
    const { id } = req.params;
    const updateData = req.body;

    const existingReview = await Review.findById(id);
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

    const review = await Review.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

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
    const { id } = req.params;
    const review = await Review.findOne({
      $or: [{ _id: id }, { slug: id }],
    });

    if (!review) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        review,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Review.countDocuments(),
    ]);

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        reviews,
      },
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

    const [reviews, total] = await Promise.all([
      Review.find({ tags: tag })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ tags: tag }),
    ]);

    res.status(200).json({
      status: 'success',
      tag,
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        reviews,
      },
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

    const [reviews, total] = await Promise.all([
      Review.find({ venue }).sort({ published_at: -1 }).skip(skip).limit(limit),
      Review.countDocuments({ venue }),
    ]);

    res.status(200).json({
      status: 'success',
      venue,
      results: reviews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        reviews,
      },
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
    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found',
      });
    }

    if (review.image_url) {
      await deleteFromR2(review.image_url);
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
