const Movie = require('../models/movie.model');
const { uploadToR2, deleteFromR2 } = require('../utils/r2');

exports.createMovie = async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      isNetflix,
      netflixUrl,
      isPrimeVideo,
      primeVideoUrl,
      isShowmax,
      showmaxUrl,
      isYouTube,
      youtubeUrl,
      isIrokotv,
      irokotvUrl,
      rating,
      genre,
      releaseYear,
      tags,
      creator,
      published_at,
    } = req.body;

    if (
      !title ||
      !description ||
      !content ||
      !releaseYear ||
      !published_at ||
      !category
    ) {
      return res.status(400).json({
        status: 'fail',
        message:
          'Title, description, content, category, release year and published date are required',
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToR2(req.file.buffer, req.file.mimetype, 'movies');
    }

    const movie = new Movie({
      title,
      description,
      content,
      category,
      isNetflix: isNetflix === 'true' || isNetflix === true,
      netflixUrl:
        isNetflix === 'true' || isNetflix === true ? netflixUrl : undefined,
      isPrimeVideo: isPrimeVideo === 'true' || isPrimeVideo === true,
      primeVideoUrl:
        isPrimeVideo === 'true' || isPrimeVideo === true
          ? primeVideoUrl
          : undefined,
      isShowmax: isShowmax === 'true' || isShowmax === true,
      showmaxUrl:
        isShowmax === 'true' || isShowmax === true ? showmaxUrl : undefined,
      isYouTube: isYouTube === 'true' || isYouTube === true,
      youtubeUrl:
        isYouTube === 'true' || isYouTube === true ? youtubeUrl : undefined,
      isIrokotv: isIrokotv === 'true' || isIrokotv === true,
      irokotvUrl:
        isIrokotv === 'true' || isIrokotv === true ? irokotvUrl : undefined,
      rating: rating || 0,
      genre: genre || [],
      releaseYear,
      tags: tags || [],
      creator,
      published_at: new Date(published_at),
      ...(imageUrl && { image_url: imageUrl }),
    });

    if (!movie.slug) movie.slug = movie.generateSlug(movie.title);
    if (!movie.meta_title)
      movie.meta_title = movie.generateMetaTitle(movie.title);
    if (!movie.meta_description) {
      movie.meta_description = movie.generateMetaDescription({
        title: movie.title,
        description: movie.description,
      });
    }

    await movie.save();

    res.status(201).json({
      status: 'success',
      data: {
        movie,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Slug must be unique (this title already exists)',
      });
    }
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.updateMovie = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingMovie = await Movie.findById(id);
    if (!existingMovie) {
      return res.status(404).json({
        status: 'fail',
        message: 'Movie not found',
      });
    }

    if (req.file) {
      if (existingMovie.image_url) {
        await deleteFromR2(existingMovie.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'movies'
      );
    }

    if (updateData.title) {
      updateData.slug = existingMovie.generateSlug(updateData.title);
      updateData.meta_title = existingMovie.generateMetaTitle(updateData.title);
    }

    if (updateData.description) {
      updateData.meta_description = existingMovie.generateMetaDescription({
        title: updateData.title || existingMovie.title,
        description: updateData.description,
      });
    }

    const platforms = [
      'netflix',
      'primeVideo',
      'showmax',
      'youTube',
      'irokotv',
    ];
    platforms.forEach((platform) => {
      const platformKey = `is${
        platform.charAt(0).toUpperCase() + platform.slice(1)
      }`;
      if (updateData[platformKey]) {
        updateData[platformKey] =
          updateData[platformKey] === 'true' ||
          updateData[platformKey] === true;
      }
      if (updateData[platformKey] !== true) {
        updateData[`${platform}Url`] = undefined;
      }
    });

    if (updateData.published_at) {
      updateData.published_at = new Date(updateData.published_at);
    }

    const movie = await Movie.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      status: 'success',
      data: {
        movie,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Slug must be unique (this title already exists)',
      });
    }
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getSingleMovie = async (req, res) => {
  try {
    const { slug } = req.params;
    const movie = await Movie.findOne({ slug });

    if (!movie) {
      return res.status(404).json({
        status: 'fail',
        message: 'Movie not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        movie,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getAllMovies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [movies, total] = await Promise.all([
      Movie.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Movie.countDocuments(),
    ]);

    res.status(200).json({
      status: 'success',
      results: movies.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        movies,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getMoviesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [movies, total] = await Promise.all([
      Movie.find({ category })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Movie.countDocuments({ category }),
    ]);

    res.status(200).json({
      status: 'success',
      category,
      results: movies.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        movies,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.getMoviesByGenre = async (req, res) => {
  try {
    const { genre } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [movies, total] = await Promise.all([
      Movie.find({ genre }).sort({ published_at: -1 }).skip(skip).limit(limit),
      Movie.countDocuments({ genre }),
    ]);

    res.status(200).json({
      status: 'success',
      genre,
      results: movies.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        movies,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

exports.deleteMovie = async (req, res) => {
  try {
    const { id } = req.params;
    const movie = await Movie.findByIdAndDelete(id);

    if (!movie) {
      return res.status(404).json({
        status: 'fail',
        message: 'Movie not found',
      });
    }

    if (movie.image_url) {
      await deleteFromR2(movie.image_url);
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
