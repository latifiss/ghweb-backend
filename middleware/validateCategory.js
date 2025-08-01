const departments = [
  'Bedding',
  'Bath, Rugs & Towels',
  'Window Treatments',
  'Table & Kitchen Linens',
  'Decor',
];

const departmentCategories = {
  Bedding: [
    'Bedsheet',
    'Pillow',
    'Cushions',
    'Pillowcase',
    'Blanket & Throws',
    'Valances',
    'Duvet covers',
  ],
  'Bath, Rugs & Towels': [
    'Doormat',
    'Kitchen mats',
    'Towels',
    'Bath & Pedestal mats',
    'Hallway Runners',
  ],
  'Window Treatments': ['Curtains', 'Blinds', 'Shades'],
  'Table & Kitchen Linens': ['Table Cloths', 'Napkins', 'Runners'],
  Storage: ['Shoe rack', 'Shoe storage', 'Closet accessories', 'Clothes rack'],
  Decor: ['Wall Art', 'Mirror', 'Vases', 'Lamps'],
};

module.exports = function (next) {
  const normalizedDepartment = (this.department || '').trim();

  // Debugging outputs
  console.log('Department:', this.department);
  console.log('Normalized Department:', normalizedDepartment);
  console.log(
    'Categories for Department:',
    departmentCategories[normalizedDepartment]
  );

  const departmentCategoriesList = departmentCategories[normalizedDepartment];

  // Check if departmentCategoriesList is an array
  if (!Array.isArray(departmentCategoriesList)) {
    console.error(
      `Categories for department ${normalizedDepartment} are not iterable`
    );
    return next(
      new Error(
        `Categories for department ${normalizedDepartment} are not iterable`
      )
    );
  }

  if (!departmentCategoriesList.includes(this.category)) {
    console.error(
      `Invalid category '${this.category}' for department '${normalizedDepartment}'`
    );
    return next(
      new Error(
        `${this.category} is not a valid category for department ${normalizedDepartment}`
      )
    );
  }

  next(); // Proceed with saving if the category is valid
};
