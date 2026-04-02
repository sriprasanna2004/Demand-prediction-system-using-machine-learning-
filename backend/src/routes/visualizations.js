/**
 * Dataset Visualization API
 * Reads directly from DatasetRow collection — the raw uploaded CSV data.
 * Never mixes with simulated/seeded sales.
 */
const router = require('express').Router();
const mongoose = require('mongoose');

// Lazy-load models to avoid re-registration errors
function getModels() {
  const DatasetRow = mongoose.models.DatasetRow ||
    mongoose.model('DatasetRow', new mongoose.Schema({}, { strict: false, collection: 'datasetrows' }));
  const Dataset = mongoose.models.Dataset ||
    mongoose.model('Dataset', new mongoose.Schema({}, { strict: false, collection: 'datasets' }));
  return { DatasetRow, Dataset };
}

// ── GET /api/viz/datasets-list ───────────────────────────────────
router.get('/datasets-list', async (req, res) => {
  try {
    const { Dataset } = getModels();
    const datasets = await Dataset.find(
      { status: 'mapped' },
      { dataset_id: 1, filename: 1, row_count: 1, processed_rows: 1, columns: 1, mappings: 1, preview: 1, created_at: 1, _id: 0 }
    ).sort({ created_at: -1 }).lean();
    res.json({ success: true, data: datasets });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/overview ────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    // Get mappings for this dataset
    const ds = await Dataset.findOne({ dataset_id }).lean();
    if (!ds) return res.status(404).json({ success: false, error: 'Dataset not found' });
    const m = ds.mappings || {};

    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();
    if (!rows.length) return res.json({ success: true, data: { totalQty: 0, totalRevenue: 0, totalRows: 0, totalProducts: 0, categoryBreakdown: [], columns: ds.columns } });

    // Aggregate using mapped column names
    let totalQty = 0, totalRevenue = 0;
    const productSet = new Set();
    const categoryMap = {};

    for (const r of rows) {
      const qty     = parseFloat(r[m.quantity]     || r['quantity']     || r['Quantity']     || 0);
      const sales   = parseFloat(r[m.price]        || r['Sales']        || r['sales']        || r['Revenue'] || r['revenue'] || 0);
      const cat     = String(r[m.category]         || r['Category']     || r['category']     || 'Unknown');
      const product = String(r[m.product_name]     || r['Product Name'] || r['product_name'] || r['Product'] || 'Unknown');

      totalQty     += isNaN(qty)   ? 0 : qty;
      totalRevenue += isNaN(sales) ? 0 : sales;
      productSet.add(product);

      if (!categoryMap[cat]) categoryMap[cat] = { totalQty: 0, totalRevenue: 0, count: 0 };
      categoryMap[cat].totalQty     += isNaN(qty)   ? 0 : qty;
      categoryMap[cat].totalRevenue += isNaN(sales) ? 0 : sales;
      categoryMap[cat].count++;
    }

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([_id, v]) => ({ _id, ...v }))
      .sort((a, b) => b.totalQty - a.totalQty);

    res.json({ success: true, data: {
      totalQty:     Math.round(totalQty),
      totalRevenue: Math.round(totalRevenue),
      totalRows:    rows.length,
      totalProducts: productSet.size,
      categoryBreakdown,
      columns: ds.columns,
      mappings: m,
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/timeseries ──────────────────────────────────────
router.get('/timeseries', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const dateMap = {};
    for (const r of rows) {
      const rawDate = r[m.date_or_month] || r['Order Date'] || r['date'] || r['Date'] || '';
      const qty     = parseFloat(r[m.quantity] || r['Quantity'] || r['quantity'] || 0);
      const sales   = parseFloat(r[m.price]    || r['Sales']    || r['sales']    || r['Revenue'] || 0);

      if (!rawDate) continue;
      // Normalize to YYYY-MM-DD or YYYY-MM
      let key = rawDate;
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        key = d.toISOString().slice(0, 10);
      }

      if (!dateMap[key]) dateMap[key] = { _id: key, qty: 0, revenue: 0, transactions: 0 };
      dateMap[key].qty          += isNaN(qty)   ? 0 : qty;
      dateMap[key].revenue      += isNaN(sales) ? 0 : sales;
      dateMap[key].transactions += 1;
    }

    const series = Object.values(dateMap).sort((a, b) => a._id.localeCompare(b._id));
    res.json({ success: true, data: series });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/by-category ─────────────────────────────────────
router.get('/by-category', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const catMap = {};
    const productsByCategory = {};

    for (const r of rows) {
      const cat     = String(r[m.category]     || r['Category']     || r['category']     || 'Unknown');
      const product = String(r[m.product_name] || r['Product Name'] || r['product_name'] || 'Unknown');
      const qty     = parseFloat(r[m.quantity] || r['Quantity']     || r['quantity']     || 0);
      const sales   = parseFloat(r[m.price]    || r['Sales']        || r['sales']        || r['Revenue'] || 0);

      if (!catMap[cat]) { catMap[cat] = { totalQty: 0, totalRevenue: 0, count: 0 }; productsByCategory[cat] = new Set(); }
      catMap[cat].totalQty     += isNaN(qty)   ? 0 : qty;
      catMap[cat].totalRevenue += isNaN(sales) ? 0 : sales;
      catMap[cat].count++;
      productsByCategory[cat].add(product);
    }

    const data = Object.entries(catMap).map(([_id, v]) => ({
      _id,
      totalQty:     Math.round(v.totalQty),
      totalRevenue: Math.round(v.totalRevenue),
      productCount: productsByCategory[_id].size,
      avgPrice:     v.count > 0 ? Math.round(v.totalRevenue / v.count) : 0,
    })).sort((a, b) => b.totalQty - a.totalQty);

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/top-products ────────────────────────────────────
router.get('/top-products', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    const limit = parseInt(req.query.limit) || 15;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const prodMap = {};
    for (const r of rows) {
      const name    = String(r[m.product_name] || r['Product Name'] || r['product_name'] || r['Product'] || 'Unknown');
      const cat     = String(r[m.category]     || r['Category']     || r['category']     || 'Unknown');
      const qty     = parseFloat(r[m.quantity] || r['Quantity']     || r['quantity']     || 0);
      const sales   = parseFloat(r[m.price]    || r['Sales']        || r['sales']        || r['Revenue'] || 0);

      if (!prodMap[name]) prodMap[name] = { name, category: cat, totalQty: 0, totalRevenue: 0 };
      prodMap[name].totalQty     += isNaN(qty)   ? 0 : qty;
      prodMap[name].totalRevenue += isNaN(sales) ? 0 : sales;
    }

    const data = Object.values(prodMap)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, limit)
      .map(p => ({ ...p, totalQty: Math.round(p.totalQty), totalRevenue: Math.round(p.totalRevenue) }));

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/monthly ─────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const monthMap = {};
    for (const r of rows) {
      const rawDate = r[m.date_or_month] || r['Order Date'] || r['date'] || r['Date'] || '';
      const qty     = parseFloat(r[m.quantity] || r['Quantity'] || r['quantity'] || 0);
      const sales   = parseFloat(r[m.price]    || r['Sales']    || r['sales']    || r['Revenue'] || 0);

      if (!rawDate) continue;
      const d = new Date(rawDate);
      const key = isNaN(d.getTime()) ? rawDate.slice(0, 7) : d.toISOString().slice(0, 7);

      if (!monthMap[key]) monthMap[key] = { _id: key, qty: 0, revenue: 0 };
      monthMap[key].qty     += isNaN(qty)   ? 0 : qty;
      monthMap[key].revenue += isNaN(sales) ? 0 : sales;
    }

    const data = Object.values(monthMap)
      .sort((a, b) => a._id.localeCompare(b._id))
      .map(d => ({ ...d, qty: Math.round(d.qty), revenue: Math.round(d.revenue) }));

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/by-region ───────────────────────────────────────
router.get('/by-region', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    // Auto-detect region column
    const regionCol = m.region || 'Region' || Object.keys(rows[0] || {}).find(k => k.toLowerCase().includes('region'));
    const regionMap = {};

    for (const r of rows) {
      const region = String(r[regionCol] || r['Region'] || r['region'] || 'Unknown');
      const qty    = parseFloat(r[m.quantity] || r['Quantity'] || r['quantity'] || 0);
      const sales  = parseFloat(r[m.price]    || r['Sales']    || r['sales']    || r['Revenue'] || 0);
      const profit = parseFloat(r['Profit']   || r['profit']   || 0);

      if (!regionMap[region]) regionMap[region] = { _id: region, totalQty: 0, totalRevenue: 0, totalProfit: 0, count: 0 };
      regionMap[region].totalQty     += isNaN(qty)    ? 0 : qty;
      regionMap[region].totalRevenue += isNaN(sales)  ? 0 : sales;
      regionMap[region].totalProfit  += isNaN(profit) ? 0 : profit;
      regionMap[region].count++;
    }

    const data = Object.values(regionMap)
      .map(r => ({ ...r, totalQty: Math.round(r.totalQty), totalRevenue: Math.round(r.totalRevenue), totalProfit: Math.round(r.totalProfit) }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/profit-analysis ─────────────────────────────────
router.get('/profit-analysis', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const prodMap = {};
    for (const r of rows) {
      const name   = String(r[m.product_name] || r['Product Name'] || r['product_name'] || 'Unknown');
      const sales  = parseFloat(r[m.price]    || r['Sales']        || r['sales']        || 0);
      const profit = parseFloat(r['Profit']   || r['profit']       || 0);
      const qty    = parseFloat(r[m.quantity] || r['Quantity']     || r['quantity']     || 0);

      if (!prodMap[name]) prodMap[name] = { name, totalSales: 0, totalProfit: 0, totalQty: 0 };
      prodMap[name].totalSales  += isNaN(sales)  ? 0 : sales;
      prodMap[name].totalProfit += isNaN(profit) ? 0 : profit;
      prodMap[name].totalQty    += isNaN(qty)    ? 0 : qty;
    }

    const data = Object.values(prodMap)
      .map(p => ({
        name: p.name.length > 16 ? p.name.slice(0, 16) + '…' : p.name,
        totalSales:  Math.round(p.totalSales),
        totalProfit: Math.round(p.totalProfit),
        margin:      p.totalSales > 0 ? Math.round((p.totalProfit / p.totalSales) * 100) : 0,
        totalQty:    Math.round(p.totalQty),
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 12);

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/stock-health ────────────────────────────────────
router.get('/stock-health', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const prodMap = {};
    for (const r of rows) {
      const name  = String(r[m.product_name] || r['Product Name'] || r['product_name'] || 'Unknown');
      const cat   = String(r[m.category]     || r['Category']     || r['category']     || 'Unknown');
      const qty   = parseFloat(r[m.quantity] || r['Quantity']     || r['quantity']     || 0);
      const stock = parseFloat(r[m.stock]    || r['Stock']        || r['stock']        || r['Inventory'] || 0);

      if (!prodMap[name]) prodMap[name] = { name, category: cat, totalSold: 0, stock: 0, count: 0 };
      prodMap[name].totalSold += isNaN(qty)   ? 0 : qty;
      prodMap[name].stock     += isNaN(stock) ? 0 : stock;
      prodMap[name].count++;
    }

    const data = Object.values(prodMap).map(p => {
      const avgDailyDemand = p.totalSold / Math.max(p.count, 1);
      const daysOfSupply   = avgDailyDemand > 0 && p.stock > 0 ? Math.round(p.stock / avgDailyDemand) : 999;
      return {
        name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
        category: p.category,
        stock: Math.round(p.stock),
        totalSold: Math.round(p.totalSold),
        daysOfSupply: Math.min(daysOfSupply, 365),
        status: daysOfSupply < 7 ? 'critical' : daysOfSupply < 14 ? 'low' : daysOfSupply < 30 ? 'ok' : 'healthy',
      };
    }).sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 20);

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/viz/price-distribution ─────────────────────────────
router.get('/price-distribution', async (req, res) => {
  try {
    const { DatasetRow, Dataset } = getModels();
    const { dataset_id } = req.query;
    if (!dataset_id) return res.status(400).json({ success: false, error: 'dataset_id required' });

    const ds = await Dataset.findOne({ dataset_id }).lean();
    const m  = ds?.mappings || {};
    const rows = await DatasetRow.find({ _dataset_id: dataset_id }).lean();

    const buckets = [
      { label: '$0-25',    min: 0,    max: 25    },
      { label: '$25-50',   min: 25,   max: 50    },
      { label: '$50-100',  min: 50,   max: 100   },
      { label: '$100-200', min: 100,  max: 200   },
      { label: '$200-500', min: 200,  max: 500   },
      { label: '$500-1k',  min: 500,  max: 1000  },
      { label: '$1k+',     min: 1000, max: Infinity },
    ];
    const counts = buckets.map(b => ({ ...b, count: 0, _id: b.label }));

    for (const r of rows) {
      const price = parseFloat(r[m.price] || r['Sales'] || r['Price'] || r['price'] || 0);
      if (isNaN(price)) continue;
      const bucket = counts.find(b => price >= b.min && price < b.max);
      if (bucket) bucket.count++;
    }

    res.json({ success: true, data: counts.filter(b => b.count > 0) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
