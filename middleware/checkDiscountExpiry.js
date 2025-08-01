// checkDiscountExpiry.js
const checkDiscountExpiry = function (docs) {
  const currentDate = new Date();

  docs.forEach((doc) => {
    console.log('expirey working...');
    if (
      doc.discount &&
      doc.discount_end_date &&
      doc.discount_end_date < currentDate
    ) {
      doc.discount = false;
      doc.discount_price = 0;
      doc.discount_percentage = 0;
      doc.discount_start_date = null;
      doc.discount_end_date = null;
    }
  });
};

module.exports = checkDiscountExpiry;
