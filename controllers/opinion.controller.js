const Opinion = require('../models/opinion.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');

exports.createOpinion = async (req, res) => {
  try {
    const { title, description, content, tags, published_at, creator } =
      req.body;

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
        'opinions'
      );
    }

    const opinion = new Opinion({
      title,
      description,
      content,
      tags: tags || [],
      published_at: new Date(published_at),
      creator,
      ...(imageUrl && { image_url: imageUrl }),
    });

    if (!opinion.slug) opinion.slug = opinion.generateSlug(opinion.title);
    if (!opinion.meta_title)
      opinion.meta_title = opinion.generateMetaTitle(opinion.title);
    if (!opinion.meta_description) {
      opinion.meta_description = opinion.generateMetaDescription({
        title: opinion.title,
        description: opinion.description,
      });
    }

    await opinion.save();

    res.status(201).json({
      status: 'success',
      data: {
        opinion,
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

exports.updateOpinion = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingOpinion = await Opinion.findById(id);
    if (!existingOpinion) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opinion not found',
      });
    }

    if (req.file) {
      if (existingOpinion.image_url) {
        await deleteFromR2(existingOpinion.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'opinions'
      );
    }

    if (updateData.title) {
      updateData.slug = existingOpinion.generateSlug(updateData.title);
      updateData.meta_title = existingOpinion.generateMetaTitle(
        updateData.title
      );
    }

    if (updateData.description) {
      updateData.meta_description = existingOpinion.generateMetaDescription({
        title: updateData.title || existingOpinion.title,
        description: updateData.description,
      });
    }

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const opinion = await Opinion.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      status: 'success',
      data: {
        opinion,
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

exports.getSingleOpinion = async (req, res) => {
  try {
    const { id } = req.params;
    const opinion = await Opinion.findOne({
      $or: [{ _id: id }, { slug: id }],
    });

    if (!opinion) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opinion not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        opinion,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getAllOpinions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [opinions, total] = await Promise.all([
      Opinion.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Opinion.countDocuments(),
    ]);

    res.status(200).json({
      status: 'success',
      results: opinions.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        opinions,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getOpinionsByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [opinions, total] = await Promise.all([
      Opinion.find({ tags: tag })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Opinion.countDocuments({ tags: tag }),
    ]);

    res.status(200).json({
      status: 'success',
      tag,
      results: opinions.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        opinions,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.deleteOpinion = async (req, res) => {
  try {
    const { id } = req.params;
    const opinion = await Opinion.findByIdAndDelete(id);

    if (!opinion) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opinion not found',
      });
    }

    if (opinion.image_url) {
      await deleteFromR2(opinion.image_url);
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
