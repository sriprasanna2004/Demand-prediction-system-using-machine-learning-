const Sale = require('../models/Sale');
const Product = require('../models/Product');

/**
 * Simulates a realistic sale event.
 * Picks a random active product and generates a plausible quantity
 * based on time-of-day and category demand patterns.
 */
async function runSimulation() {
  const products = await Product.find({ isActive: true }).select('_id price category stock');
  if (!products.length) return null;

  const product = products[Math.floor(Math.random() * products.length)];
  const hour = new Date().getHours();

  // Simulate demand curve: higher during business hours
  const demandMultiplier = hour >= 9 && hour <= 20 ? 1.5 : 0.5;
  const baseQty = getCategoryBaseQty(product.category);
  const quantity = Math.max(1, Math.round(baseQty * demandMultiplier * (0.5 + Math.random())));

  const sale = await Sale.create({
    productId: product._id,
    quantity,
    price: product.price,
    source: 'simulated',
    timestamp: new Date()
  });

  // Decrement stock (floor at 0)
  await Product.findByIdAndUpdate(product._id, {
    $inc: { stock: -Math.min(quantity, product.stock) }
  });

  return sale;
}

function getCategoryBaseQty(category) {
  const map = {
    Electronics: 2,
    Clothing: 5,
    Food: 10,
    Furniture: 1,
    Books: 4,
    Toys: 3
  };
  return map[category] || 3;
}

module.exports = { runSimulation };
