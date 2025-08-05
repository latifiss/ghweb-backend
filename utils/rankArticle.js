const keywordRelevance = require('./keywordRelevance');

/**
 * Compute a relevance score for a news article
 * @param {Object} article - News article with title, description, keywords
 * @param {Object} source - Object with source_credibility
 * @returns {Number} score
 */
function rankArticle(article, source) {
  const { title = '', description = '', keywords = [] } = article;
  const text = `${title} ${description}`.toLowerCase();

  let keywordScore = 0;

  for (const [keyword, weight] of Object.entries(keywordRelevance)) {
    if (text.includes(keyword.toLowerCase())) {
      keywordScore += weight;
    }
  }

  for (const keyword of keywords) {
    if (keywordRelevance[keyword]) {
      keywordScore += keywordRelevance[keyword];
    }
  }

  const finalScore = keywordScore * 4.5;

  return finalScore;
}

module.exports = rankArticle;
