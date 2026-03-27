const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String, unique: true, sparse: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

productSchema.index({ category: 1 });
productSchema.index({ name: 'text' });

module.exports = mongoose.model('Product', productSchema);
