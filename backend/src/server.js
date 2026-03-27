require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cron = require('node-cron');

const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const predictRoutes = require('./routes/predict');
const insightRoutes = require('./routes/insights');
const externalRoutes = require('./routes/externalData');
const forecastRoutes = require('./routes/forecast');
const rlRoutes = require('./routes/rl');
const { runSimulation } = require('./services/simulationEngine');
const { emitDashboardUpdate } = require('./services/socketService');
const { fetchWeather, fetchMarketTrend } = require('./services/externalApiService');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] }
});

// Make io accessible in routes
app.set('io', io);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Global rate limiter — 200 req/min per IP across all endpoints
app.use(rateLimiter({ max: 200, windowMs: 60000 }));

// Routes
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/predict', rateLimiter({ max: 60, windowMs: 60000 }), predictRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/external-data', externalRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/rl', rlRoutes);

app.get('/health', async (_, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  let mlOk = false;
  try {
    const axios = require('axios');
    await axios.get(`${process.env.ML_SERVICE_URL || 'http://localhost:5001'}/health`, { timeout: 3000 });
    mlOk = true;
  } catch (_e) { /* ml down */ }

  res.json({
    status: 'ok',
    ts: new Date(),
    db: dbState === 1 ? 'connected' : 'disconnected',
    ml: mlOk ? 'connected' : 'unavailable'
  });
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

// Real-time simulation: insert a new sale every 8 seconds
cron.schedule('*/8 * * * * *', async () => {
  try {
    const sale = await runSimulation();
    if (sale) {
      io.emit('new_sale', sale);
      const update = await emitDashboardUpdate();
      io.emit('dashboard_update', update);
    }
  } catch (err) {
    console.error('Simulation error:', err.message);
  }
});

// Refresh external signals every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    await Promise.allSettled([fetchWeather('New York'), fetchMarketTrend('XRT')]);
    console.log('External signals refreshed');
  } catch (err) {
    console.error('External refresh error:', err.message);
  }
});

// Nightly ML model retrain at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  try {
    const axios = require('axios');
    const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    const res = await axios.post(`${ML_URL}/train`, {}, { timeout: 120000 });
    console.log('Nightly retrain complete:', res.data?.metrics);
  } catch (err) {
    console.error('Nightly retrain failed:', err.message);
  }
});

// Global error handler — must be last middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// Connect DB then start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
