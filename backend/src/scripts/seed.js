/**
 * Seed script — populates MongoDB with sample products and historical sales.
 * Run: node src/scripts/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');

const PRODUCTS = [
  { name: 'iPhone 15 Pro', category: 'Electronics', price: 999, stock: 80 },
  { name: 'Samsung 4K TV', category: 'Electronics', price: 799, stock: 30 },
  { name: 'Nike Air Max', category: 'Clothing', price: 120, stock: 150 },
  { name: 'Levi\'s Jeans', category: 'Clothing', price: 60, stock: 200 },
  { name: 'Organic Coffee 1kg', category: 'Food', price: 18, stock: 500 },
  { name: 'Protein Bars (12pk)', category: 'Food', price: 25, stock: 300 },
  { name: 'IKEA Desk', category: 'Furniture', price: 250, stock: 40 },
  { name: 'Office Chair', category: 'Furniture', price: 350, stock: 25 },
  { name: 'Clean Code (Book)', category: 'Books', price: 35, stock: 100 },
  { name: 'LEGO Technic Set', category: 'Toys', price: 89, stock: 60 }
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  await Product.deleteMany({});
  await Sale.deleteMany({});

  const products = await Product.insertMany(PRODUCTS);
  console.log(`Inserted ${products.length} products`);

  // Generate 90 days of historical sales
  const sales = [];
  const now = Date.now();
  for (let day = 90; day >= 0; day--) {
    const ts = new Date(now - day * 86400000);
    for (const product of products) {
      const baseQty = { Electronics: 2, Clothing: 8, Food: 20, Furniture: 1, Books: 5, Toys: 4 }[product.category] || 3;
      const qty = Math.max(1, Math.round(baseQty * (0.5 + Math.random()) * (1 + 0.3 * Math.sin(day / 7))));
      sales.push({ productId: product._id, quantity: qty, price: product.price, source: 'simulated', timestamp: ts });
    }
  }

  await Sale.insertMany(sales);
  console.log(`Inserted ${sales.length} historical sales`);

  await mongoose.disconnect();
  console.log('Done. Database seeded successfully.');
}

seed().catch((e) => { console.error(e); process.exit(1); });
