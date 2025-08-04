const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const musicSchema = new Schema(
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
    isAudioMack: {
      type: Boolean,
      required: true,
      default: false,
    },
    audioMackUrl: {
      type: String,
      required: function () {
        return this.isAudioMack;
      },
      trim: true,
    },
    isSpotify: {
      type: Boolean,
      required: true,
      default: false,
    },
    spotifyUrl: {
      type: String,
      required: function () {
        return this.isSpotify;
      },
      trim: true,
    },
    isAppleMusic: {
      type: Boolean,
      required: true,
      default: false,
    },
    appleMusicUrl: {
      type: String,
      required: function () {
        return this.isAppleMusic;
      },
      trim: true,
    },
    isBoomplay: {
      type: Boolean,
      required: true,
      default: false,
    },
    boomplayUrl: {
      type: String,
      required: function () {
        return this.isBoomplay;
      },
      trim: true,
    },
    isYoutubeMusic: {
      type: Boolean,
      required: true,
      default: false,
    },
    youtubeMusicUrl: {
      type: String,
      required: function () {
        return this.isYoutubeMusic;
      },
      trim: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
    },
    label: {
      type: String,
      trim: true,
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
    creator: {
      type: String,
      default: 'Admin',
    },
    author: {
      type: String,
      required: true,
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

musicSchema.pre('save', function (next) {
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

musicSchema.methods.generateSlug = function (title) {
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

musicSchema.methods.generateMetaTitle = function (title) {
  if (!title) return '';
  const cleanedTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '');
  if (cleanedTitle.length <= 60) return cleanedTitle;
  return cleanedTitle.substring(0, 57).trim() + '...';
};

musicSchema.methods.generateMetaDescription = function (data) {
  if (data.description) {
    return data.description.substring(0, 155).trim();
  }
  return `${data.title || 'Music track'}. ${
    data.description || 'Listen now.'
  }`.substring(0, 155);
};

const Music = mongoose.model('Music', musicSchema);

module.exports = Music;
