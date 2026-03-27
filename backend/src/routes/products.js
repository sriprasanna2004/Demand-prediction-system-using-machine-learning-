const router = require('express').Router();
const Product = require('../models/Product');
const validate = require('../middleware/validate');

const productSchema = {
  name:     { type: 'string', required: true, minLength: 1, maxLength: 100 },
  category: { type: 'string', required: true, enum: ['Electronics','Clothing','Food','Furniture','Books','Toys'] },
  price:    { type: 'number', required: true, min: 0, max: 1000000 },
  stock:    { type: 'number', required: true, min: 0 },
};

// GET all products
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create product
router.post('/', validate(productSchema), async (req, res) => {
  try {
    const product = await Product.create(req.body);
    req.app.get('io').emit('product_added', product);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    req.app.get('io').emit('product_updated', product);
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
