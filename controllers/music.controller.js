const Music = require('../models/music.model');
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

const invalidateMusicCache = async () => {
  await Promise.all([
    deleteCacheByPattern('music:*'),
    deleteCacheByPattern('musics:*'),
    deleteCacheByPattern('genre:*'),
  ]);
};

exports.createMusic = async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      isAudioMack,
      audioMackUrl,
      isSpotify,
      spotifyUrl,
      isAppleMusic,
      appleMusicUrl,
      isBoomplay,
      boomplayUrl,
      isYoutubeMusic,
      youtubeMusicUrl,
      rating,
      label,
      tags,
      author,
      creator,
      published_at,
    } = req.body;

    if (
      !title ||
      !description ||
      !content ||
      !author ||
      !published_at ||
      !category
    ) {
      return res.status(400).json({
        status: 'fail',
        message:
          'Title, description, content, author, category and published date are required',
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToR2(req.file.buffer, req.file.mimetype, 'music');
    }

    const music = new Music({
      title,
      description,
      content,
      category,
      isAudioMack: isAudioMack === 'true' || isAudioMack === true,
      audioMackUrl:
        isAudioMack === 'true' || isAudioMack === true
          ? audioMackUrl
          : undefined,
      isSpotify: isSpotify === 'true' || isSpotify === true,
      spotifyUrl:
        isSpotify === 'true' || isSpotify === true ? spotifyUrl : undefined,
      isAppleMusic: isAppleMusic === 'true' || isAppleMusic === true,
      appleMusicUrl:
        isAppleMusic === 'true' || isAppleMusic === true
          ? appleMusicUrl
          : undefined,
      isBoomplay: isBoomplay === 'true' || isBoomplay === true,
      boomplayUrl:
        isBoomplay === 'true' || isBoomplay === true ? boomplayUrl : undefined,
      isYoutubeMusic: isYoutubeMusic === 'true' || isYoutubeMusic === true,
      youtubeMusicUrl:
        isYoutubeMusic === 'true' || isYoutubeMusic === true
          ? youtubeMusicUrl
          : undefined,
      rating: rating || 0,
      label,
      tags: tags || [],
      author,
      creator,
      published_at: new Date(published_at),
      ...(imageUrl && { image_url: imageUrl }),
    });

    if (!music.slug) music.slug = music.generateSlug(music.title);
    if (!music.meta_title)
      music.meta_title = music.generateMetaTitle(music.title);
    if (!music.meta_description) {
      music.meta_description = music.generateMetaDescription({
        title: music.title,
        description: music.description,
      });
    }

    await music.save();

    await invalidateMusicCache();

    res.status(201).json({
      status: 'success',
      data: {
        music,
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

exports.updateMusic = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = req.body;

    const existingMusic = await Music.findOne({ slug: slug });
    if (!existingMusic) {
      return res.status(404).json({
        status: 'fail',
        message: 'No music found with that ID',
      });
    }

    if (req.file) {
      if (existingMusic.image_url) {
        await deleteFromR2(existingMusic.image_url);
      }
      updateData.image_url = await uploadToR2(
        req.file.buffer,
        req.file.mimetype,
        'music'
      );
    }

    if (updateData.title) {
      updateData.slug = existingMusic.generateSlug(updateData.title);
      updateData.meta_title = existingMusic.generateMetaTitle(updateData.title);
    }

    if (updateData.description) {
      updateData.meta_description = existingMusic.generateMetaDescription({
        title: updateData.title || existingMusic.title,
        description: updateData.description,
      });
    }

    const platforms = [
      'audioMack',
      'spotify',
      'appleMusic',
      'boomplay',
      'youtubeMusic',
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

    const music = await Music.findOneAndUpdate({ slug: slug }, updateData, {
      new: true,
      runValidators: true,
    });

    await Promise.all([
      deleteCacheByPattern(`music:${music.slug}`),
      deleteCacheByPattern(`music:${music._id}`),
      deleteCacheByPattern('musics:list:*'),
      invalidateMusicCache(),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        music,
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

exports.getSingleMusic = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `music:${slug}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const music = await Music.findOne({ slug });

    if (!music) {
      return res.status(404).json({
        status: 'fail',
        message: 'Music not found',
      });
    }

    const responseData = {
      music,
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

exports.getAllMusic = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('musics:list', { page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [music, total] = await Promise.all([
      Music.find().sort({ published_at: -1 }).skip(skip).limit(limit),
      Music.countDocuments(),
    ]);

    const responseData = {
      results: music.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        music,
      },
    };

    await setCache(cacheKey, responseData, 3600);
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

exports.getAllMusicByGenre = async (req, res) => {
  try {
    const { genre } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = generateCacheKey('genre:music', { genre, page, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        ...cachedData,
      });
    }

    const [music, total] = await Promise.all([
      Music.find({ tags: genre })
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Music.countDocuments({ tags: genre }),
    ]);

    const responseData = {
      genre,
      results: music.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        music,
      },
    };

    await setCache(cacheKey, responseData, 3600);
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

exports.deleteMusic = async (req, res) => {
  try {
    const { id } = req.params;
    const music = await Music.findByIdAndDelete(id);

    if (!music) {
      return res.status(404).json({
        status: 'fail',
        message: 'Music not found',
      });
    }

    if (music.image_url) {
      await deleteFromR2(music.image_url);
    }

    await invalidateMusicCache();

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
