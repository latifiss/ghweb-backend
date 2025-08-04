const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const opinionSchema = new Schema(
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

opinionSchema.pre('save', function (next) {
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

opinionSchema.methods.generateSlug = function (title) {
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

opinionSchema.methods.generateMetaTitle = function (title) {
  if (!title) return '';
  const cleanedTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '');
  if (cleanedTitle.length <= 60) return cleanedTitle;
  return cleanedTitle.substring(0, 57).trim() + '...';
};

opinionSchema.methods.generateMetaDescription = function (data) {
  if (data.description) {
    return data.description.substring(0, 155).trim();
  }
  return `${data.title || 'Review'}. ${
    data.description || 'Read our detailed review.'
  }`.substring(0, 155);
};

const Opinion = mongoose.model('Opinion', opinionSchema);

module.exports = Opinion;
