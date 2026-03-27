const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    source: { type: String, enum: ['manual', 'simulated', 'api'], default: 'manual' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

saleSchema.index({ productId: 1, timestamp: -1 });
saleSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Sale', saleSchema);
