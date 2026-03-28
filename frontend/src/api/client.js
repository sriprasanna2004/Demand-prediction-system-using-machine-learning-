// v5 - uses relative URLs proxied via vercel.json → Railway
import axios from 'axios';

// In production: Vercel proxies /api/* → Railway backend
// In development: setupProxy.js proxies /api/* → localhost:4000
const api = axios.create({ baseURL: '', timeout: 15000 });

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(new Error(err.response?.data?.error || err.message || 'Request failed'))
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
    // Parse CSV in browser, send as JSON — avoids multipart proxy issues
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
  train: () => axios.post('/api/datasets/train', {}, { timeout: 200000 }).then(r => r.data)
};

export const analyticsApi = {
  decompose: (productId, days) => api.get(`/api/analytics/decompose/${productId}`, { params: { days } }),
  anomalies: (productId, days) => api.get(`/api/analytics/anomalies/${productId}`, { params: { days } }),
  elasticity: (productId) => api.get(`/api/analytics/elasticity/${productId}`),
  whatif: (productId, scenarios) => api.post('/api/analytics/whatif', { productId, scenarios }),
  performance: (days) => api.get('/api/analytics/monitor/performance', { params: { days } }),
  drift: () => api.get('/api/analytics/monitor/drift'),
  audit: (productId, limit) => api.get('/api/analytics/monitor/audit', { params: { productId, limit } }),
  trainPPO: () => api.post('/api/analytics/train/ppo')
};

export default api;
