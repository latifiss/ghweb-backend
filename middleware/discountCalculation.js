module.exports = function (next) {
  try {
    // Log the initial state of the product
    console.log('Calculating discount for product:', this);

    // Calculate discount percentage if discount details are present
    if (this.discount && this.discount_price) {
      this.discount_percentage = Math.round(
        ((this.unit_price - this.discount_price) / this.unit_price) * 100
      );
      // Log the calculated discount percentage
      console.log(
        `Discount percentage calculated: ${this.discount_percentage}%`
      );
    } else {
      this.discount_percentage = 0;
      // Log that no discount was applied
      console.log('No discount applied, setting discount_percentage to 0');
    }

    // Check if the discount has expired and reset values if it has
    if (this.discount_end_date && new Date() > this.discount_end_date) {
      this.discount = false;
      this.discount_price = 0;
      this.discount_percentage = 0;
      // Log the discount expiry
      console.log('Discount has expired. Resetting discount values.');
    }

    // Proceed to the next middleware
    next();
  } catch (error) {
    // Log the error and pass it to the next middleware
    console.error('Error in discount calculation middleware:', error);
    next(error);
  }
};
