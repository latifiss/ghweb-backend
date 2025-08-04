const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const liveArticleSchema = new Schema({
  content_title: {
    type: String,
    required: true,
    trim: true,
  },
  isKey: {
    type: Boolean,
    required: true,
    default: false,
  },
  content_description: {
    type: String,
    required: true,
    trim: true,
  },
  content_detail: {
    type: String,
    required: true,
    trim: true,
  },
  content_image_url: {
    type: String,
    required: false,
  },
  content_published_at: {
    type: Date,
    default: Date.now,
  },
});

const articleSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    category: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],
    tags: [
      {
        type: String,
      },
    ],
    isLive: {
      type: Boolean,
      required: true,
      default: false,
    },
    wasLive: {
      type: Boolean,
      required: true,
      default: false,
    },
    isBreaking: {
      type: Boolean,
      required: true,
      default: false,
    },
    isHeadline: {
      type: Boolean,
      required: true,
      default: false,
    },
    label: {
      type: String,
      trim: true,
    },
    source_name: {
      type: String,
      required: true,
      trim: true,
      default: 'Ghanaian web',
    },
    meta_title: {
      type: String,
    },
    meta_description: {
      type: String,
    },
    creator: {
      type: String,
      default: 'Admin',
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
    },
    image_url: {
      type: String,
      required: false,
    },
    published_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

articleSchema.methods.createLiveArticle = function (data) {
  return new mongoose.Document(data, liveArticleSchema);
};

articleSchema.methods.validateLiveArticle = function (data) {
  const LiveArticle = mongoose.model('LiveArticle', liveArticleSchema);
  const liveArticle = new LiveArticle(data);
  return liveArticle.validateSync();
};

articleSchema.methods.createLiveArticleFromString = function (content) {
  return {
    content_title: this.title,
    content_description: this.description,
    content_detail: content,
    content_image_url: this.image_url,
    content_published_at: this.published_at,
    isKey: false,
  };
};

articleSchema.pre('validate', function (next) {
  if (this.isLive) {
    if (typeof this.content === 'string') {
      this.content = [this.createLiveArticleFromString(this.content)];
    }
  } else {
    if (Array.isArray(this.content)) {
      this.content = this.content[0]?.content_detail || '';
    }
  }
  next();
});

articleSchema.pre('save', function (next) {
  if (this.isModified('wasLive') && this.wasLive) {
    this.isLive = false;
  }
  next();
});

articleSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.generateSlug(this.title);
  }
  next();
});

articleSchema.methods.generateMetaTitle = function (title) {
  if (!title) return '';
  const cleanedTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '');
  if (cleanedTitle.length <= 60) return cleanedTitle;
  return cleanedTitle.substring(0, 57).trim() + '...';
};

articleSchema.methods.generateMetaDescription = function (data) {
  if (data.description) {
    return data.description.substring(0, 155).trim();
  }
  return `${data.title || 'Feature'}. ${
    data.description || 'Read our detailed feature.'
  }`.substring(0, 155);
};

articleSchema.methods.generateSlug = function (title) {
  if (!title) return '';
  return title
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const Article = mongoose.model('Article', articleSchema);

module.exports = { Article, liveArticleSchema };
