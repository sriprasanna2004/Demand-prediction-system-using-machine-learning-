/**
 * Saved prediction scenarios
 * POST /api/scenarios       — save a scenario
 * GET  /api/scenarios       — list all saved scenarios
 * DELETE /api/scenarios/:id — delete a scenario
 */
const router = require('express').Router();
const mongoose = require('mongoose');

const ScenarioSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  productId:   String,
  productName: String,
  inputs:      mongoose.Schema.Types.Mixed,
  result:      mongoose.Schema.Types.Mixed,
  createdAt:   { type: Date, default: Date.now }
});
const Scenario = mongoose.models.Scenario || mongoose.model('Scenario', ScenarioSchema);

router.post('/', async (req, res) => {
  try {
    const { name, productId, productName, inputs, result } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const s = await Scenario.create({ name, productId, productName, inputs, result });
    res.status(201).json({ success: true, data: s });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const scenarios = await Scenario.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: scenarios });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Scenario.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
