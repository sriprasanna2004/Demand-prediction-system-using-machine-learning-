// Development proxy — all /api/* calls go to local backend
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use('/api', createProxyMiddleware({
    target: 'http://localhost:4000',
    changeOrigin: true
  }));
};
