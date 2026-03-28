const router = require('express').Router();
const axios = require('axios');
const multer = require('multer');
const mongoose = require('mongoose');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Parse CSV without external dependency
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    records.push(row);
  }
  return { headers, records };
}

// Simple dataset schema stored in MongoDB directly from backend
const DatasetSchema = new mongoose.Schema({
  dataset_id: String,
  filename: String,
  columns: [String],
  row_count: Number,
  status: { type: String, default: 'uploaded' },
  preview: mongoose.Schema.Types.Mixed,
  processed_rows: Number,
  errors: Number,
  mappings: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now },
  mapped_at: Date
});
const Dataset = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema);

const RawRowSchema = new mongoose.Schema({ _dataset_id: String }, { strict: false });
const RawRow = mongoose.models.DatasetRaw || mongoose.model('DatasetRaw', RawRowSchema);

const ProcessedRowSchema = new mongoose.Schema({ _dataset_id: String }, { strict: false });
const ProcessedRow = mongoose.models.DatasetRow || mongoose.model('DatasetRow', ProcessedRowSchema);

// POST /api/datasets/upload-json — receive parsed CSV as JSON (no multipart needed)
router.post('/upload-json', async (req, res) => {
  try {
    const { filename, headers, records } = req.body;
    if (!headers || !records || !records.length) {
      return res.status(400).json({ success: false, error: 'No data provided' });
    }

    const dataset_id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preview = records.slice(0, 5);

    await Dataset.create({
      dataset_id, filename: filename || 'upload.csv',
      columns: headers, row_count: records.length,
      status: 'uploaded', preview, created_at: new Date()
    });

    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => ({ ...r, _dataset_id: dataset_id }));
      await RawRow.insertMany(batch, { ordered: false });
    }

    res.json({
      success: true,
      data: {
        dataset_id, filename: filename || 'upload.csv',
        row_count: records.length, columns: headers, preview,
        required_fields: ['date_or_month', 'quantity', 'product_name', 'category', 'price'],
        optional_fields: ['temperature', 'trend_score', 'stock', 'day_of_week']
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const content = req.file.buffer.toString('utf-8');
    let records, columns;
    try {
      const parsed = parseCSV(content);
      records = parsed.records;
      columns = parsed.headers;
    } catch (e) {
      return res.status(400).json({ success: false, error: `CSV parse error: ${e.message}` });
    }

    if (!records.length) return res.status(400).json({ success: false, error: 'CSV file is empty' });

    const dataset_id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preview = records.slice(0, 5);

    await Dataset.create({ dataset_id, filename: req.file.originalname, columns, row_count: records.length, status: 'uploaded', preview, created_at: new Date() });

    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => ({ ...r, _dataset_id: dataset_id }));
      await RawRow.insertMany(batch, { ordered: false });
    }

    res.json({
      success: true,
      data: {
        dataset_id, filename: req.file.originalname,
        row_count: records.length, columns, preview,
        required_fields: ['date_or_month', 'quantity', 'product_name', 'category', 'price'],
        optional_fields: ['temperature', 'trend_score', 'stock', 'day_of_week']
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/datasets/map
router.post('/map', async (req, res) => {
  try {
    const { dataset_id, mappings } = req.body;
    if (!dataset_id || !mappings) return res.status(400).json({ success: false, error: 'dataset_id and mappings required' });

    const rawRows = await RawRow.find({ _dataset_id: dataset_id }).lean();
    if (!rawRows.length) return res.status(404).json({ success: false, error: 'Dataset not found' });

    const SEASONAL_INDEX = { 1:0.85,2:0.80,3:0.90,4:0.95,5:1.00,6:1.05,7:1.10,8:1.05,9:1.00,10:1.05,11:1.20,12:1.40 };
    const CATEGORY_ENCODING = { Electronics:0,Clothing:1,Food:2,Furniture:3,Books:4,Toys:5 };

    const processed = [];
    let errors = 0;

    for (const row of rawRows) {
      try {
        const qtyCol = mappings.quantity;
        if (!qtyCol || !(qtyCol in row)) { errors++; continue; }

        const qty = parseFloat(row[qtyCol]);
        if (isNaN(qty)) { errors++; continue; }

        const price = mappings.price && row[mappings.price] ? parseFloat(row[mappings.price]) : 50;
        const category = mappings.category && row[mappings.category] ? String(row[mappings.category]) : 'Electronics';
        const product_name = mappings.product_name && row[mappings.product_name] ? String(row[mappings.product_name]) : 'Unknown';

        let month = 6;
        if (mappings.date_or_month && row[mappings.date_or_month]) {
          const val = row[mappings.date_or_month];
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) month = parsed.getMonth() + 1;
          else if (!isNaN(parseInt(val))) month = Math.min(12, Math.max(1, parseInt(val)));
        }

        const temperature = mappings.temperature && row[mappings.temperature] ? parseFloat(row[mappings.temperature]) : 20;
        const trend_score = mappings.trend_score && row[mappings.trend_score] ? parseFloat(row[mappings.trend_score]) : 50;
        const stock = mappings.stock && row[mappings.stock] ? parseFloat(row[mappings.stock]) : 50;
        const day_of_week = mappings.day_of_week && row[mappings.day_of_week] ? parseInt(row[mappings.day_of_week]) : 3;
        const cat_code = CATEGORY_ENCODING[category] ?? -1;

        processed.push({
          _dataset_id: dataset_id,
          quantity: qty, price, category, product_name, month,
          temperature, trend_score, stock, day_of_week,
          // Pre-computed ML features
          avg_daily_sales_90d: qty / 90,
          avg_daily_sales_30d: qty / 30,
          avg_daily_sales_7d: qty / 7,
          category_avg_qty: qty / 30,
          data_quality: 0.8,
          category_code: cat_code,
          seasonal_index: SEASONAL_INDEX[month] || 1.0,
          is_weekend: day_of_week >= 5 ? 1 : 0
        });
      } catch (e) { errors++; }
    }

    if (processed.length) {
      const batchSize = 500;
      for (let i = 0; i < processed.length; i += batchSize) {
        await ProcessedRow.insertMany(processed.slice(i, i + batchSize), { ordered: false });
      }
    }

    await Dataset.updateOne({ dataset_id }, {
      $set: { status: 'mapped', processed_rows: processed.length, errors, mappings, mapped_at: new Date() }
    });

    res.json({ success: true, data: { processed_rows: processed.length, errors, message: `Processed ${processed.length} rows. Ready to retrain.` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/datasets
router.get('/', async (req, res) => {
  try {
    const datasets = await Dataset.find({}, { _id: 0 }).sort({ created_at: -1 }).limit(20).lean();
    res.json({ success: true, data: datasets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/datasets/:id
router.delete('/:id', async (req, res) => {
  try {
    await Promise.all([
      Dataset.deleteOne({ dataset_id: req.params.id }),
      RawRow.deleteMany({ _dataset_id: req.params.id }),
      ProcessedRow.deleteMany({ _dataset_id: req.params.id })
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/datasets/train — trigger ensemble retrain via ML service
router.post('/train', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_URL}/train/ensemble`, {}, { timeout: 180000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    // Fallback: trigger RF retrain
    try {
      const rfRes = await axios.post(`${ML_URL}/train`, {}, { timeout: 120000 });
      res.json({ success: true, data: rfRes.data });
    } catch (e) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

module.exports = router;
