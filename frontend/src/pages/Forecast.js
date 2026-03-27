import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { productsApi, forecastApi } from '../api/client';
import ForecastChart from '../components/ForecastChart';
import styles from './Forecast.module.css';

const HORIZONS = [
  { key: '1h', label: 'Next 1 Hour' },
  { key: '24h', label: 'Next 24 Hours' },
  { key: '7d', label: 'Next 7 Days' }
];

export default function Forecast() {
  const [productId, setProductId] = useState('');
  const [horizon, setHorizon] = useState('24h');
  const [explainMode, setExplainMode] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [explanation, setExplanation] = useState(null);

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll().then((r) => r.data)
  });

  const forecastMutation = useMutation({
    mutationFn: () => forecastApi.getForecast(productId, horizon),
    onSuccess: (res) => setForecastData(res.data)
  });

  const explainMutation = useMutation({
    mutationFn: () => forecastApi.explain(productId),
    onSuccess: (res) => setExplanation(res.data)
  });

  const handleRun = () => {
    if (!productId) return;
    forecastMutation.mutate();
    if (explainMode) explainMutation.mutate();
  };

  const selectedProduct = products?.find(p => p._id === productId);

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Demand Forecast</h1>
        <p className={styles.subtitle}>Time-series predictions with confidence intervals</p>
      </motion.div>

      <motion.div className={styles.controls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <select className={styles.select} value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Select a product</option>
          {products?.map(p => <option key={p._id} value={p._id}>{p.name} ({p.category})</option>)}
        </select>

        <div className={styles.horizonGroup}>
          {HORIZONS.map(h => (
            <button key={h.key} className={styles.horizonBtn}
              data-active={horizon === h.key}
              onClick={() => setHorizon(h.key)}>
              {h.label}
            </button>
          ))}
        </div>

        <label className={styles.explainToggle}>
          <input type="checkbox" checked={explainMode} onChange={e => setExplainMode(e.target.checked)} />
          <span>🧠 Explain AI</span>
        </label>

        <button className={styles.btnRun} onClick={handleRun}
          disabled={!productId || forecastMutation.isPending}>
          {forecastMutation.isPending ? 'Forecasting...' : 'Run Forecast'}
        </button>
      </motion.div>

      <AnimatePresence>
        {forecastData && (
          <motion.div className={styles.resultGrid}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  {selectedProduct?.name} — {HORIZONS.find(h => h.key === horizon)?.label}
                </h2>
                <div className={styles.metaBadges}>
                  <span className={styles.badge}>
                    Confidence: {(forecastData.confidence * 100).toFixed(0)}%
                  </span>
                  <span className={styles.badge}>
                    Total: {forecastData.total} units
                  </span>
                  <span className={styles.badge}>
                    Data Points: {forecastData.data_points}
                  </span>
                </div>
              </div>
              <ForecastChart data={forecastData.points} horizon={horizon} />
            </div>

            {explainMode && explanation && (
              <motion.div className={styles.card}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className={styles.cardTitle}>🧠 AI Explanation</h2>
                <div className={styles.explanationBox}>
                  {explanation.explanation?.explanation?.map((line, i) => (
                    <motion.p key={i} className={styles.explanationLine}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}>
                      {line}
                    </motion.p>
                  ))}
                </div>
                <h3 className={styles.subTitle}>Top Factors</h3>
                <div className={styles.factorList}>
                  {explanation.explanation?.contributions?.slice(0, 5).map((c, i) => (
                    <motion.div key={i} className={styles.factorItem}
                      initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: i * 0.08 }}>
                      <div className={styles.factorLabel}>{c.label}</div>
                      <div className={styles.factorBar}>
                        <div className={styles.factorFill}
                          data-dir={c.direction}
                          style={{ width: `${Math.min(100, Math.abs(c.impact) * 5)}%` }} />
                      </div>
                      <div className={styles.factorImpact}
                        data-dir={c.direction}>
                        {c.direction === 'positive' ? '+' : ''}{c.impact}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!forecastData && !forecastMutation.isPending && (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.emptyIcon}>📊</div>
          <p>Select a product and run a forecast to see time-series predictions.</p>
        </motion.div>
      )}
    </div>
  );
}
