const router = require('express').Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/datasets/upload — proxy CSV to ML service
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    const mlRes = await axios.post(`${ML_URL}/dataset/upload`, form, {
      headers: form.getHeaders(), timeout: 30000
    });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/datasets/map — apply column mapping
router.post('/map', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_URL}/dataset/map`, req.body, { timeout: 30000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/datasets — list all datasets
router.get('/', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/dataset/list`, { timeout: 10000 });
    res.json({ success: true, data: mlRes.data.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/datasets/:id
router.delete('/:id', async (req, res) => {
  try {
    await axios.delete(`${ML_URL}/dataset/${req.params.id}`, { timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/datasets/train — retrain ensemble on uploaded data
router.post('/train', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_URL}/train/ensemble`, {}, { timeout: 180000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
