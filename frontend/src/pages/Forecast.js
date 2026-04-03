import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { productsApi, forecastApi } from '../api/client';
import ForecastChart from '../components/ForecastChart';
import styles from './Forecast.module.css';

const HORIZONS = [
  { key: '1h',  label: '1 Hour' },
  { key: '24h', label: '24 Hours' },
  { key: '7d',  label: '7 Days' }
];

function exportForecastCSV(data, productName, horizon) {
  if (!data?.points?.length) return;
  const rows = [['Time', 'Predicted', 'Lower', 'Upper']];
  data.points.forEach(p => rows.push([p.time, p.value, p.lower, p.upper]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `forecast_${productName}_${horizon}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast.success('Forecast exported');
}

export default function Forecast() {
  const [productId, setProductId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [horizon, setHorizon] = useState('24h');
  const [explainMode, setExplainMode] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [explanation, setExplanation] = useState(null);

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll().then(r => r.data)
  });

  const forecastMutation = useMutation({
    mutationFn: () => forecastApi.getForecast(productId, horizon),
    onSuccess: res => setForecastData(res.data),
    onError: e => toast.error(`Forecast failed: ${e.message}`)
  });

  const compareMutation = useMutation({
    mutationFn: () => forecastApi.getForecast(compareId, horizon),
    onSuccess: res => setCompareData(res.data),
    onError: e => toast.error(`Compare forecast failed: ${e.message}`)
  });

  const explainMutation = useMutation({
    mutationFn: () => forecastApi.explain(productId),
    onSuccess: res => setExplanation(res.data),
    onError: () => {}
  });

  const handleRun = () => {
    if (!productId) return;
    setCompareData(null);
    forecastMutation.mutate();
    if (explainMode) explainMutation.mutate();
    if (compareId) compareMutation.mutate();
  };

  const selectedProduct = products?.find(p => p._id === productId);
  const compareProduct  = products?.find(p => p._id === compareId);

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Demand Forecast</h1>
        <p className={styles.subtitle}>Time-series predictions with confidence intervals and product comparison</p>
      </motion.div>

      <motion.div className={styles.controls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <select className={styles.select} value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Select product</option>
          {products?.map(p => <option key={p._id} value={p._id}>{p.name} ({p.category})</option>)}
        </select>

        <select className={styles.select} style={{ minWidth: 160 }} value={compareId} onChange={e => setCompareId(e.target.value)}>
          <option value="">+ Compare with...</option>
          {products?.filter(p => p._id !== productId).map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
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
          <span>🧠 Explain</span>
        </label>

        <button className={styles.btnRun} onClick={handleRun}
          disabled={!productId || forecastMutation.isPending}>
          {forecastMutation.isPending ? 'Forecasting...' : '▶ Run Forecast'}
        </button>

        {forecastData && (
          <button className={styles.btnExport}
            onClick={() => exportForecastCSV(forecastData, selectedProduct?.name || 'product', horizon)}>
            ⬇ CSV
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {forecastData && (
          <motion.div className={styles.resultGrid}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* Summary stat row */}
            <div className={styles.statRow}>
              {[
                { label: 'Total Demand', value: `${forecastData.total} units` },
                { label: 'Confidence',   value: `${(forecastData.confidence * 100).toFixed(0)}%` },
                { label: 'Data Points',  value: forecastData.data_points },
                { label: 'Method',       value: forecastData.method?.replace(/_/g, ' ') || 'ML' },
              ].map(s => (
                <div key={s.label} className={styles.statBox}>
                  <span className={styles.statVal}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
              {compareData && [
                { label: `${compareProduct?.name} Total`, value: `${compareData.total} units` },
                { label: 'Compare Confidence', value: `${(compareData.confidence * 100).toFixed(0)}%` },
              ].map(s => (
                <div key={s.label} className={styles.statBox} style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
                  <span className={styles.statVal} style={{ color: 'var(--success)' }}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Main chart */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  {selectedProduct?.name}
                  {compareProduct && <span style={{ color: 'var(--success)', marginLeft: 8 }}>vs {compareProduct.name}</span>}
                  {' — '}{HORIZONS.find(h => h.key === horizon)?.label}
                </h2>
                <div className={styles.metaBadges}>
                  <span className={styles.badge} style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }}>
                    {forecastData.method?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <ForecastChart data={forecastData.points} compareData={compareData?.points} horizon={horizon} />
            </div>

            {/* Explanation */}
            {explainMode && explanation && (
              <motion.div className={styles.card}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className={styles.cardTitle}>🧠 AI Explanation</h2>
                <div className={styles.explanationBox}>
                  {explanation.explanation?.explanation?.map((line, i) => (
                    <motion.p key={i} className={styles.explanationLine}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}>{line}</motion.p>
                  ))}
                </div>
                {explanation.explanation?.contributions?.length > 0 && (
                  <>
                    <h3 className={styles.subTitle}>Top Factors</h3>
                    <div className={styles.factorList}>
                      {explanation.explanation.contributions.slice(0, 5).map((c, i) => (
                        <div key={i} className={styles.factorItem}>
                          <div className={styles.factorLabel}>{c.label}</div>
                          <div className={styles.factorBar}>
                            <div className={styles.factorFill} data-dir={c.direction}
                              style={{ width: `${Math.min(100, Math.abs(c.impact) * 5)}%` }} />
                          </div>
                          <div className={styles.factorImpact} data-dir={c.direction}>
                            {c.direction === 'positive' ? '+' : ''}{c.impact}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!forecastData && !forecastMutation.isPending && (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.emptyIcon}>📊</div>
          <p>Select a product and run a forecast to see time-series predictions.</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Optionally add a second product to compare forecasts side by side.
          </p>
        </motion.div>
      )}
    </div>
  );
}
