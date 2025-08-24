const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const reviewSchema = new Schema(
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
    rating: {
      type: Number,
      required: false,
      min: 0,
      max: 5,
    },
    label: {
      type: String,
      trim: true,
    },
    venue: {
      type: String,
      required: false,
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

reviewSchema.pre('save', function (next) {
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

reviewSchema.methods.generateSlug = function (title) {
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

reviewSchema.methods.generateMetaTitle = function (title) {
  if (!title) return '';
  const cleanedTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '');
  if (cleanedTitle.length <= 60) return cleanedTitle;
  return cleanedTitle.substring(0, 57).trim() + '...';
};

reviewSchema.methods.generateMetaDescription = function (data) {
  if (data.description) {
    return data.description.substring(0, 155).trim();
  }
  return `${data.title || 'Review'}. ${
    data.description || 'Read our detailed review.'
  }`.substring(0, 155);
};

const NigReview = mongoose.model('NigReview', reviewSchema);

module.exports = NigReview;
