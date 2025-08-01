// utils/tagNoteCron.js
const cron = require('node-cron');
const mongoose = require('mongoose');
const Product = require('../models/Product.model.js').Product;

const tagTemplates = {
  status: {
    new_arrival: [
      'Brand new arrival! Just added to our collection',
      'New release! Be among the first to own this',
      'Fresh stock just landed - limited quantities',
    ],
    deal: [
      'Special deal! Limited-time promotion',
      'Exclusive offer - save while supplies last',
      "Flash sale price - won't last long!",
    ],
    active: [
      'Customer favorite - highly rated',
      'Bestseller - order now for fast delivery',
      'Top choice in this category',
    ],
    sold_out: [
      'Temporarily out of stock',
      'Restocking soon - check back later',
      'Next shipment expected soon',
    ],
  },
  features: {
    free_shipping: [
      'FREE shipping on this item',
      'Shipping included - no extra fees',
      'Free delivery to your doorstep',
    ],
    returns_eligible: [
      'Easy returns - shop with confidence',
      'Hassle-free 30-day return policy',
      'Protected by our satisfaction guarantee',
    ],
  },
};

function getRandomTag(tagArray) {
  return tagArray[Math.floor(Math.random() * tagArray.length)];
}

function generateProductTagNote(product) {
  const tags = [];

  if (product.product_status && tagTemplates.status[product.product_status]) {
    tags.push(getRandomTag(tagTemplates.status[product.product_status]));
  }

  if (!['deal', 'sold_out'].includes(product.product_status)) {
    if (product.free_shipping) {
      tags.push(getRandomTag(tagTemplates.features.free_shipping));
    }
    if (product.returns_eligible) {
      tags.push(getRandomTag(tagTemplates.features.returns_eligible));
    }
  }

  return tags.length > 0
    ? tags.join(' • ')
    : '🌟 Quality product - ready to ship';
}

const tagNoteUpdateJob = cron.schedule(
  '*/2 * * * *', // Every 5 minutes
  async () => {
    console.log('\n--- Starting tag note update cycle ---');
    const startTime = Date.now();

    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }

      const batchSize = 100;
      let processedCount = 0;
      let updatedCount = 0;

      const productCursor = Product.find().lean().cursor();

      for await (const product of productCursor) {
        processedCount++;
        const newTag = generateProductTagNote(product);

        if (newTag !== product.tag_note) {
          await Product.updateOne(
            { _id: product._id },
            { $set: { tag_note: newTag } }
          );
          updatedCount++;
        }

        if (processedCount % batchSize === 0) {
          console.log(
            `Processed ${processedCount} products, updated ${updatedCount} tags`
          );
        }
      }

      console.log(
        `\nTag update completed. Processed: ${processedCount}, Updated: ${updatedCount}`
      );
    } catch (error) {
      console.error('Tag update error:', error);
    } finally {
      console.log(
        `Cycle completed in ${(Date.now() - startTime) / 1000} seconds`
      );
      console.log('--- End of tag update cycle ---\n');
    }
  },
  {
    scheduled: false,
    timezone: 'UTC',
  }
);

module.exports = tagNoteUpdateJob;
