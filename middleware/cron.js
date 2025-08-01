const cron = require('node-cron');
const mongoose = require('mongoose');
const { Product } = require('../models/Product.model.js'); // Note the destructuring since you're exporting multiple models

// Add connection check
const checkConnection = () => {
  return mongoose.connection.readyState === 1; // 1 = connected
};

const discountUpdateJob = cron.schedule(
  '* * * * *',
  async () => {
    console.log('Running discount update...');
    try {
      // Check connection before running
      if (!checkConnection()) {
        console.log('MongoDB not connected, skipping discount update');
        return;
      }

      const now = new Date();

      // Use updateMany instead of find + loop
      const result = await Product.updateMany(
        {
          discount: true,
          discount_end_date: { $lt: now },
        },
        {
          $set: {
            discount: false,
            discount_percentage: 0,
            discount_price: 0,
          },
        }
      );

      console.log('Finished discount update...');
      console.log(
        `Discounts updated at ${now}: ${result.modifiedCount} products updated.`
      );
    } catch (error) {
      console.error('Error updating expired discounts:', error);
    }
  },
  {
    scheduled: false, // Don't start automatically
  }
);

module.exports = discountUpdateJob;
