import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000',
  timeout: 15000
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
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
  getWeather: (location) => api.get('/api/external-data/weather', { params: { location } }),
  getMarket: (symbol) => api.get('/api/external-data/market', { params: { symbol } })
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

export default api;
