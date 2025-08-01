const cron = require('node-cron');
const mongoose = require('mongoose');

// Model loading with validation
let Product, Promotion;

try {
  Product = require('../models/Product.model').Product;
  console.log('Product model loaded successfully');
} catch (err) {
  console.error('Error loading Product model:', err);
  throw err;
}

try {
  Promotion = require('../models/promotions.model');
  console.log('Promotion model loaded successfully');
} catch (err) {
  console.error('Error loading Promotion model:', err);
  throw err;
}

// Connection check
const checkConnection = () => {
  const status = mongoose.connection.readyState;
  console.log('MongoDB status:', mongoose.STATES[status]);
  return status === 1;
};

const productStatusUpdateJob = cron.schedule(
  '*/5 * * * *', // Every 5 minutes
  async () => {
    console.log('\n--- Starting product status update ---');
    const startTime = Date.now();

    try {
      // Validate environment
      if (!checkConnection()) throw new Error('MongoDB not connected');
      if (!Product || !Promotion) throw new Error('Models not loaded');

      const now = new Date();
      console.log('Execution time:', now.toISOString());

      // PHASE 1: Get all active promotions with their thumbnails
      const activePromotions = await Promotion.find({
        status: 'active',
        start_time: { $lte: now },
        end_time: { $gte: now },
      })
        .select('products thumbnail')
        .lean();

      // Create a map of product IDs to promotion thumbnails
      const promotionMap = new Map();
      activePromotions.forEach((promo) => {
        if (Array.isArray(promo.products)) {
          promo.products.forEach((productId) => {
            promotionMap.set(productId.toString(), promo.thumbnail || '');
          });
        }
      });

      console.log(`Found ${promotionMap.size} products in active promotions`);

      // PHASE 2: Update promoted products (deal status + thumbnails)
      const promotedProductUpdates = [];
      const promotedProducts = await Product.find({
        _id: { $in: Array.from(promotionMap.keys()) },
        item_quantity: { $gt: 0 },
      })
        .select('product_status promotion_thumbnail')
        .lean();

      promotedProducts.forEach((product) => {
        const promoThumbnail = promotionMap.get(product._id.toString());
        const updates = {
          product_status: 'deal',
          promotion_thumbnail: promoThumbnail,
        };

        // Only update if status or thumbnail needs changing
        if (
          product.product_status !== 'deal' ||
          product.promotion_thumbnail !== promoThumbnail
        ) {
          promotedProductUpdates.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $set: updates },
            },
          });
        }
      });

      // Execute bulk update for promoted products
      if (promotedProductUpdates.length > 0) {
        const result = await Product.bulkWrite(promotedProductUpdates);
        console.log(
          `Updated ${result.modifiedCount} promoted products (deal status + thumbnails)`
        );
      }

      // PHASE 3: Update non-promoted products
      const nonPromotedProductIds = Array.from(promotionMap.keys());
      const productsToReview = await Product.find({
        _id: { $nin: nonPromotedProductIds }, // Only non-promoted products
      })
        .select('product_status item_quantity created_at promotion_thumbnail')
        .lean();

      const bulkOps = [];
      const statusChanges = {
        new_arrival: 0,
        sold_out: 0,
        active: 0,
      };

      productsToReview.forEach((product) => {
        let newStatus = 'active';
        let updates = {};

        if (product.item_quantity <= 0) {
          newStatus = 'sold_out';
        } else if (isNewArrival(product.created_at)) {
          newStatus = 'new_arrival';
        }

        // Clear promotion thumbnail if product is no longer in a promotion
        if (product.promotion_thumbnail && product.promotion_thumbnail !== '') {
          updates.promotion_thumbnail = '';
        }

        // Only update status if it's changing
        if (product.product_status !== newStatus) {
          updates.product_status = newStatus;
        }

        if (Object.keys(updates).length > 0) {
          bulkOps.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $set: updates },
            },
          });
          statusChanges[newStatus]++;
        }
      });

      if (bulkOps.length > 0) {
        const result = await Product.bulkWrite(bulkOps);
        console.log('Updated non-promoted products:', {
          new_arrival: statusChanges.new_arrival,
          sold_out: statusChanges.sold_out,
          active: statusChanges.active,
        });
      }
    } catch (error) {
      console.error('CRITICAL ERROR:', error);
      // Add your error reporting here
    } finally {
      console.log(
        `Cycle completed in ${(Date.now() - startTime) / 1000} seconds`
      );
      console.log('--- End of update cycle ---\n');
    }
  },
  { scheduled: false, timezone: 'UTC' }
);

// Improved new arrival check
function isNewArrival(createdDate) {
  if (!createdDate) return false;
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  return new Date(createdDate) >= fourDaysAgo;
}

module.exports = productStatusUpdateJob;
