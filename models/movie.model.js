const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const movieSchema = new Schema(
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
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    isNetflix: {
      type: Boolean,
      required: true,
      default: false,
    },
    netflixUrl: {
      type: String,
      required: function () {
        return this.isNetflix;
      },
      trim: true,
    },
    isPrimeVideo: {
      type: Boolean,
      required: true,
      default: false,
    },
    primeVideoUrl: {
      type: String,
      required: function () {
        return this.isPrimeVideo;
      },
      trim: true,
    },
    isShowmax: {
      type: Boolean,
      required: true,
      default: false,
    },
    showmaxUrl: {
      type: String,
      required: function () {
        return this.isShowmax;
      },
      trim: true,
    },
    isYouTube: {
      type: Boolean,
      required: true,
      default: false,
    },
    youtubeUrl: {
      type: String,
      required: function () {
        return this.isYouTube;
      },
      trim: true,
    },
    isIrokotv: {
      type: Boolean,
      required: true,
      default: false,
    },
    irokotvUrl: {
      type: String,
      required: function () {
        return this.isIrokotv;
      },
      trim: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
    },
    genre: {
      type: [String],
      default: [],
    },
    releaseYear: {
      type: Number,
      required: true,
    },
    meta_title: {
      type: String,
    },
    meta_description: {
      type: String,
    },
    tags: [
      {
        type: String,
      },
    ],
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

movieSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.generateSlug(this.title);
    this.meta_title = this.generateMetaTitle(this.title);
  }

  if (this.isModified('description')) {
    this.meta_description = this.generateMetaDescription({
      title: this.title,
      description: this.description,
    });
  }
  next();
});

movieSchema.methods.generateSlug = function (title) {
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

movieSchema.methods.generateMetaTitle = function (title) {
  if (!title) return '';
  const cleanedTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '');
  if (cleanedTitle.length <= 60) return cleanedTitle;
  return cleanedTitle.substring(0, 57).trim() + '...';
};

movieSchema.methods.generateMetaDescription = function (data) {
  if (data.description) {
    return data.description.substring(0, 155).trim();
  }
  return `${data.title || 'Movie'}. ${
    data.description || 'Watch now.'
  }`.substring(0, 155);
};

const Movie = mongoose.model('Movie', movieSchema);

module.exports = Movie;
