const router = require('express').Router();
const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  contactEmail:  { type: String, trim: true },
  contactPhone:  { type: String, trim: true },
  location:      { type: String, trim: true },
  categories:    [String],
  avgLeadDays:   { type: Number, default: 7 },
  reliabilityPct:{ type: Number, default: 95 },
  costPerUnit:   { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
  notes:         { type: String },
}, { timestamps: true });

const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);

router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: suppliers });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const s = await Supplier.create(req.body);
    res.status(201).json({ success: true, data: s });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const s = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ success: false, error: 'Supplier not found' });
    res.json({ success: true, data: s });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
