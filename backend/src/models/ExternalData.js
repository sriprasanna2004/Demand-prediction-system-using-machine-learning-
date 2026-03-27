const mongoose = require('mongoose');

const externalDataSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['weather', 'market_trend'], required: true },
    location: { type: String, default: 'global' },
    temperature: { type: Number },
    weatherCondition: { type: String },
    humidity: { type: Number },
    trendScore: { type: Number },       // 0-100 market sentiment
    symbol: { type: String },           // stock/market symbol
    rawData: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

externalDataSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model('ExternalData', externalDataSchema);
