const { Article } = require('../models/article.model');
const rankArticle = require('../utils/rankArticle');

const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

exports.getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const minLatestInTop = 2;
    const now = new Date();

    // 1. Fetch and pre-process articles
    const allArticles = await Article.find().sort({ published_at: -1 });

    // 2. Filter and rank articles
    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });

      // Penalize articles older than 36 hours
      if (age > FRESHNESS_THRESHOLD) {
        score *= 0.3; // Reduce score to 30% of original
      }

      return {
        ...article.toObject(),
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
      };
    });

    // 3. Sort by score (highest first)
    const rankedArticles = processedArticles.sort((a, b) => b.score - a.score);

    // 4. Ensure freshness in top results
    const latestArticles = allArticles
      .filter((a) => now - new Date(a.published_at) <= FRESHNESS_THRESHOLD)
      .slice(0, minLatestInTop);

    const topRanked = rankedArticles.slice(0, 6);

    // Merge strategy (preserve ranking but ensure freshness)
    const finalTopSix = [
      ...latestArticles,
      ...topRanked.filter(
        (a) => !latestArticles.some((l) => l._id.equals(a._id))
      ),
    ].slice(0, 6);

    // 5. Combine results
    const remainingArticles = rankedArticles.filter(
      (article) => !finalTopSix.some((a) => a._id.equals(article._id))
    );

    const finalResults = [...finalTopSix, ...remainingArticles].slice(0, limit);

    res.status(200).json({
      status: 'success',
      data: {
        articles: finalResults,
        meta: {
          total: allArticles.length,
          freshCount: processedArticles.filter((a) => a.isFresh).length,
          latestInTop: latestArticles.filter((article) =>
            finalTopSix.some((a) => a._id.equals(article._id))
          ).length,
        },
      },
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
    const limit = parseInt(req.query.limit) || 30; // Increased default to accommodate 24+ articles
    const now = new Date();
    const TOP_SECTION_SIZE = 6;
    const MIXED_SECTION_SIZE = 24; // First 24 articles with 45% latest, 55% ranked
    const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000; // 36 hours in milliseconds

    // 1. Fetch all category articles sorted by date - UPDATED TO HANDLE ARRAY CATEGORIES
    const categoryRegex = new RegExp(`^${category}$`, 'i');
    const allArticles = await Article.find({
      category: { $elemMatch: { $regex: categoryRegex } },
    }).sort({
      published_at: -1,
    });

    // 2. Process articles with ranking and freshness
    const processedArticles = allArticles.map((article) => {
      const age = now - new Date(article.published_at);
      let score = rankArticle(article, { source_credibility: 0.8 });

      // Penalize articles older than 36 hours
      if (age > FRESHNESS_THRESHOLD) {
        score *= 0.3;
      }

      return {
        ...article.toObject(),
        score,
        isFresh: age <= FRESHNESS_THRESHOLD,
        published_at: article.published_at, // Keep original date
      };
    });

    // 3. Create separate sorted lists
    const freshArticles = processedArticles.filter((a) => a.isFresh);
    const rankedArticles = [...processedArticles].sort(
      (a, b) => b.score - a.score
    );

    // 4. Build first 6 articles (special logic)
    const firstSixLatest = freshArticles.slice(0, 3); // ~50% of 6
    const firstSixRanked = rankedArticles
      .filter((a) => !firstSixLatest.some((l) => l._id.equals(a._id)))
      .slice(0, 3); // ~50% of 6
    const firstSix = [...firstSixLatest, ...firstSixRanked]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, TOP_SECTION_SIZE);

    // 5. Build next 18 articles (45% latest, 55% ranked from remaining)
    const remainingForMixed = {
      latest: freshArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
      ranked: rankedArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
    };

    const latestCount = Math.ceil(18 * 0.45); // 8 latest (45% of 18)
    const rankedCount = Math.floor(18 * 0.55); // 10 ranked (55% of 18)

    const mixedSection = [
      ...remainingForMixed.latest.slice(0, latestCount),
      ...remainingForMixed.ranked.slice(0, rankedCount),
    ].sort((a, b) => b.score - a.score); // Sort mixed section by score

    // 6. Build remaining articles (latest only)
    const remainingLatest = freshArticles
      .filter(
        (a) => ![...firstSix, ...mixedSection].some((f) => f._id.equals(a._id))
      )
      .slice(0, limit - MIXED_SECTION_SIZE);

    // 7. Combine all sections
    const finalResults = [
      ...firstSix,
      ...mixedSection,
      ...remainingLatest,
    ].slice(0, limit);

    res.status(200).json({
      status: 'success',
      data: {
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
      },
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
    const now = new Date();
    const TOP_SECTION_SIZE = 6;
    const MIXED_SECTION_SIZE = 24;
    const FRESHNESS_THRESHOLD = 36 * 60 * 60 * 1000;

    // 1. Fetch articles containing the tag (case-insensitive partial match)
    const allArticles = await Article.find({
      tags: { $regex: new RegExp(tag, 'i') },
    }).sort({ published_at: -1 });

    // 2. Process articles with ranking and freshness
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

    // 3. Create separate sorted lists
    const freshArticles = processedArticles.filter((a) => a.isFresh);
    const rankedArticles = [...processedArticles].sort(
      (a, b) => b.score - a.score
    );

    // 4. Build first 6 articles (special logic)
    const firstSixLatest = freshArticles.slice(0, 3);
    const firstSixRanked = rankedArticles
      .filter((a) => !firstSixLatest.some((l) => l._id.equals(a._id)))
      .slice(0, 3);
    const firstSix = [...firstSixLatest, ...firstSixRanked]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, TOP_SECTION_SIZE);

    // 5. Build next 18 articles (45% latest, 55% ranked from remaining)
    const remainingForMixed = {
      latest: freshArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
      ranked: rankedArticles.filter(
        (a) => !firstSix.some((f) => f._id.equals(a._id))
      ),
    };

    const latestCount = Math.ceil(18 * 0.45); // 8 latest
    const rankedCount = Math.floor(18 * 0.55); // 10 ranked

    const mixedSection = [
      ...remainingForMixed.latest.slice(0, latestCount),
      ...remainingForMixed.ranked.slice(0, rankedCount),
    ].sort((a, b) => b.score - a.score);

    // 6. Build remaining articles (latest only)
    const remainingLatest = freshArticles
      .filter(
        (a) => ![...firstSix, ...mixedSection].some((f) => f._id.equals(a._id))
      )
      .slice(0, limit - MIXED_SECTION_SIZE);

    // 7. Combine all sections
    const finalResults = [
      ...firstSix,
      ...mixedSection,
      ...remainingLatest,
    ].slice(0, limit);

    res.status(200).json({
      status: 'success',
      data: {
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
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
