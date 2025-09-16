const { SpfArticle } = require('../../models/spf/article.model');
const rankArticle = require('../../utils/rankArticle');
const { getRedisClient } = require('../../lib/redis');

const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

const generateCacheKey = (prefix, params) => {
  return `${prefix}:${Object.values(params).join(':')}`;
};

const setCache = async (key, data, expiration = 300) => {
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
    return cachedData ? 极JSON.parse(cachedData) : null;
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

exports.getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cacheKey = generateCacheKey('feed:main', { limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const minLatestInTop = 2;
    const now = new Date();

    const allArticles = await SpfArticle.find({
      isHeadline: { $ne: true },
    }).sort({ published_at: -1 });

    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });
      if (age > FRESHNESS_THRESHOLD) score *= 0.3;
      return {
        ...article.toObject(),
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
      };
    });

    const rankedArticles = processedArticles.sort((a, b) => b.score - a.score);

    const latestArticles = allArticles
      .filter((a) => now - new Date(a.published_at) <= FRESHNESS_THRESHOLD)
      .slice(0, minLatestInTop);

    const topRanked = rankedArticles.slice(0, 6);

    const finalTopSix = [
      ...latestArticles,
      ...topRanked.filter(
        (a) => !latestArticles.some((l) => l._id.equals(a._id))
      ),
    ].slice(0, 6);

    const remainingArticles = rankedArticles.filter(
      (article) => !finalTopSix.some((a) => a._id.equals(article._id))
    );

    const finalResults = [...finalTopSix, ...remainingArticles].slice(0, limit);

    const responseData = {
      articles: finalResults,
      meta: {
        total: allArticles.length,
        freshCount: processedArticles.filter((a) => a.isFresh).length,
        latestInTop: latestArticles.filter((article) =>
          finalTopSix.some((a) => a._id.equals(article._id))
        ).length,
      },
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

exports.getFeedByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 30;
    const cacheKey = generateCacheKey('feed:category', { category, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const now = new Date();
    const TOP_SECTION_SIZE = 6;
    const MIXED_SECTION_SIZE = 24;
    const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

    const categoryRegex = new RegExp(`^${category}$`, 'i');
    const allArticles = await SpfArticle.find({
      category: { $elemMatch: { $regex: categoryRegex } },
      isCategoryHeadline: { $ne: true },
    }).sort({ published_at: -1 });

    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });
      if (age > FRESHNESS_THRESHOLD) score *= 0.3;
      return {
        ...article.toObject(),
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
        published_at: article.published_at,
      };
    });

    const freshArticles = processedArticles.filter((a) => a.isFresh);
    const rankedArticles = [...processedArticles].sort(
      (a, b) => b.score - a.score
    );

    const firstSixLatest = freshArticles.slice(0, 3);
    const firstSixRanked = rankedArticles
      .filter((a) => !firstSixLatest.some((l) => l._id.equals(a._id)))
      .slice(0, 3);
    const firstSix = [...firstSixLatest, ...firstSixRanked]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, TOP_SECTION_SIZE);

    const remainingForMixed = {
      latest: freshArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
      ranked: rankedArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
    };

    const latestCount = Math.ceil(18 * 0.45);
    const rankedCount = Math.floor(18 * 0.55);

    const mixedSection = [
      ...remainingForMixed.latest.slice(0, latestCount),
      ...remainingForMixed.ranked.slice(0, rankedCount),
    ].sort((a, b) => b.score - a.score);

    const remainingLatest = freshArticles
      .filter(
        (a) => ![...firstSix, ...mixedSection].some((f) => f._id.equals(a._id))
      )
      .slice(0, limit - MIXED_SECTION_SIZE);

    const finalResults = [
      ...firstSix,
      ...mixedSection,
      ...remainingLatest,
    ].slice(0, limit);

    const responseData = {
      articles: finalResults,
      meta: {
        category,
        total: allArticles.length,
        freshCount: freshArticles.length,
        sections: {
          firstSix: {
            latest: firstSixLatest.length,
            ranked: firstSixRanked.length,
          },
          mixedSection: {
            latest: latestCount,
            ranked: rankedCount,
            ratio: '45:55',
          },
          remaining: {
            type: 'latestOnly',
            count: remainingLatest.length,
          },
        },
        freshnessThreshold: '36 hours',
      },
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

exports.getFeedByTags = async (req, res) => {
  try {
    const { tag } = req.params;
    const limit = parseInt(req.query.limit) || 30;
    const cacheKey = generateCacheKey('feed:tag', { tag, limit });
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: cachedData,
      });
    }

    const now = new Date();
    const TOP_SECTION_SIZE = 6;
    const MIXED_SECTION_SIZE = 24;
    const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

    const allArticles = await SpfArticle.find({
      tags: { $regex: new RegExp(tag, 'i') },
    }).sort({ published_at: -1 });

    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });

      if (age > FRESHNESS_THRESHOLD) {
        score *= 0.3;
      }

      return {
        ...article.toObject(),
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
        published_at: article.published_at,
      };
    });

    const freshArticles = processedArticles.filter((a) => a.isFresh);
    const rankedArticles = [...processedArticles].sort(
      (a, b) => b.score - a.score
    );

    const firstSixLatest = freshArticles.slice(0, 3);
    const firstSixRanked = rankedArticles
      .filter((a) => !firstSixLatest.some((l) => l._id.equals(a._id)))
      .slice(0, 3);
    const firstSix = [...firstSixLatest, ...firstSixRanked]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, TOP_SECTION_SIZE);

    const remainingForMixed = {
      latest: freshArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
      ranked: rankedArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
    };

    const latestCount = Math.ceil(18 * 0.45);
    const rankedCount = Math.floor(18 * 0.55);

    const mixedSection = [
      ...remainingForMixed.latest.slice(0, latestCount),
      ...remainingForMixed.ranked.slice(0, rankedCount),
    ].sort((a, b) => b.score - a.score);

    const remainingLatest = freshArticles
      .filter(
        (a) => ![...firstSix, ...mixedSection].some((f) => f._id.equals(a._id))
      )
      .slice(0, limit - MIXED_SECTION_SIZE);

    const finalResults = [
      ...firstSix,
      ...mixedSection,
      ...remainingLatest,
    ].slice(0, limit);

    const responseData = {
      articles: finalResults,
      meta: {
        tag,
        total: allArticles.length,
        freshCount: freshArticles.length,
        sections: {
          firstSix: {
            latest: firstSixLatest.length,
            ranked: firstSixRanked.length,
          },
          mixedSection: {
            latest: latestCount,
            ranked: rankedCount,
            ratio: '45:55',
          },
          remaining: {
            type: 'latestOnly',
            count: remainingLatest.length,
          },
        },
        freshnessThreshold: '36 hours',
      },
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
