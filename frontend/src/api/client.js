// Direct Railway URL — no proxy, no env var dependency
import axios from 'axios';

const RAILWAY = 'https://divine-surprise-production-1666.up.railway.app';
const BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : RAILWAY;

const api = axios.create({ baseURL: BASE, timeout: 30000 });

// Keep-alive ping every 10 minutes to prevent Render cold starts
if (typeof window !== 'undefined') {
  setInterval(() => {
    axios.get(`${BASE}/health`, { timeout: 5000 }).catch(() => {});
  }, 10 * 60 * 1000);
}

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return Promise.reject(new Error('Server is waking up — please try again in a moment'));
    }
    return Promise.reject(new Error(err.response?.data?.error || err.message || 'Request failed'));
  }
);

export const productsApi = {
  getAll: (params) => api.get('/api/products', { params }),
  getOne: (id) => api.get(`/api/products/${id}`),
  create: (data) => api.post('/api/products', data),
  update: (id, data) => api.put(`/api/products/${id}`, data),
  remove: (id) => api.delete(`/api/products/${id}`)
};

export const salesApi = {
  getAll: (params) => api.get('/api/sales', { params }),
  getAggregate: (days) => api.get('/api/sales/aggregate', { params: { days } }),
  create: (data) => api.post('/api/sales', data)
};

export const predictApi = {
  predict: (data) => api.post('/api/predict', data),
  batchPredict: (date) => api.get('/api/predict/batch', { params: { date } }),
  retrain: () => api.post('/api/predict/retrain')
};

export const insightsApi = {
  getSummary: () => api.get('/api/insights'),
  getTimeseries: (days) => api.get('/api/insights/timeseries', { params: { days } })
};

export const externalApi = {
  getLatest: () => api.get('/api/external-data/latest'),
  getWeather: (loc) => api.get('/api/external-data/weather', { params: { location: loc } }),
  getMarket: (sym) => api.get('/api/external-data/market', { params: { symbol: sym } })
};

export const forecastApi = {
  getForecast: (productId, horizon) => api.post('/api/forecast', { productId, horizon }),
  explain: (productId, targetDate, price) => api.post('/api/forecast/explain', { productId, targetDate, price })
};

export const rlApi = {
  decide: (productId, predictedDemand) => api.post('/api/rl/decide', { productId, predictedDemand }),
  batchDecide: () => api.get('/api/rl/batch'),
  scenario: (productId, scenario) => api.post('/api/rl/scenario', { productId, scenario })
};

export const datasetsApi = {
  upload: async (file) => {
    const text = await file.text();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV must have at least a header and one data row');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const records = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
      return row;
    });
    return api.post('/api/datasets/upload-json', { filename: file.name, headers, records });
  },
  map: (data) => api.post('/api/datasets/map', data),
  list: () => api.get('/api/datasets'),
  remove: (id) => api.delete(`/api/datasets/${id}`),
  train: () => axios.create({ baseURL: BASE, timeout: 200000 }).post('/api/datasets/train').then(r => r.data)
};

export const analyticsApi = {
  decompose: (productId, days) => api.get(`/api/analytics/decompose/${productId}`, { params: { days } }),
  anomalies: (productId, days) => api.get(`/api/analytics/anomalies/${productId}`, { params: { days } }),
  elasticity: (productId) => api.get(`/api/analytics/elasticity/${productId}`),
  whatif: (productId, scenarios) => api.post('/api/analytics/whatif', { productId, scenarios }),
  performance: (days) => api.get('/api/analytics/monitor/performance', { params: { days } }),
  drift: () => api.get('/api/analytics/monitor/drift'),
  audit: (productId, limit) => api.get('/api/analytics/monitor/audit', { params: { productId, limit } }),
  trainPPO: () => api.post('/api/analytics/train/ppo'),
  // v4 additions
  modelCard: (days) => api.get('/api/analytics/model-card', { params: { days } }),
  experiments: (limit) => api.get('/api/analytics/experiments', { params: { limit } }),
  optimizePrice: (data) => api.post('/api/analytics/optimize/price', data),
  batchPredictions: (limit) => api.get('/api/analytics/batch-predictions', { params: { limit } }),
  reorderPoint: (data) => api.post('/api/analytics/supply/reorder-point', data),
};

export const vizApi = {
  datasetsList:      ()            => api.get('/api/viz/datasets-list'),
  overview:          (dsId)        => api.get('/api/viz/overview',          { params: { dataset_id: dsId } }),
  timeseries:        (dsId)        => api.get('/api/viz/timeseries',        { params: { dataset_id: dsId } }),
  byCategory:        (dsId)        => api.get('/api/viz/by-category',       { params: { dataset_id: dsId } }),
  topProducts:       (dsId, limit) => api.get('/api/viz/top-products',      { params: { dataset_id: dsId, limit } }),
  monthly:           (dsId)        => api.get('/api/viz/monthly',           { params: { dataset_id: dsId } }),
  byRegion:          (dsId)        => api.get('/api/viz/by-region',         { params: { dataset_id: dsId } }),
  profitAnalysis:    (dsId)        => api.get('/api/viz/profit-analysis',   { params: { dataset_id: dsId } }),
  priceDistribution: (dsId)        => api.get('/api/viz/price-distribution',{ params: { dataset_id: dsId } }),
  stockHealth:       (dsId)        => api.get('/api/viz/stock-health',      { params: { dataset_id: dsId } }),
};

export default api;
