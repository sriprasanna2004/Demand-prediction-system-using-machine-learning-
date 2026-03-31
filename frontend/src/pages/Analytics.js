import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend } from 'chart.js';
import { productsApi, analyticsApi } from '../api/client';
import styles from './Analytics.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

const TABS = ['Decomposition', 'Anomalies', 'Elasticity', 'What-If', 'Monitoring'];

const WHATIF_PRESETS = [
  { name: '10% Price Drop', price_change: -0.1, trend_change: 0 },
  { name: '20% Price Drop', price_change: -0.2, trend_change: 0 },
  { name: '10% Price Rise', price_change: 0.1, trend_change: 0 },
  { name: 'Bullish Market', price_change: 0, trend_change: 20 },
  { name: 'Bearish Market', price_change: 0, trend_change: -20 },
  { name: 'Price Drop + Bull', price_change: -0.1, trend_change: 15 },
];

const chartOpts = (title) => ({
  responsive: true,
  plugins: {
    legend: { labels: { color: '#64748b', font: { size: 11 } } },
    tooltip: { backgroundColor: 'rgba(5,8,16,0.95)', borderColor: 'rgba(99,102,241,0.3)', borderWidth: 1, titleColor: '#f1f5f9', bodyColor: '#94a3b8', padding: 10, cornerRadius: 8 }
  },
  scales: {
    x: { ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 14 }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.04)' } }
  }
});

export default function Analytics() {
  const [tab, setTab] = useState('Decomposition');
  const [productId, setProductId] = useState('');

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.getAll().then(r => r.data) });
  const selectedProduct = products?.find(p => p._id === productId);

  const decompQuery = useQuery({
    queryKey: ['decompose', productId],
    queryFn: () => analyticsApi.decompose(productId, 90).then(r => r.data),
    enabled: !!productId && tab === 'Decomposition'
  });

  const anomalyQuery = useQuery({
    queryKey: ['anomalies', productId],
    queryFn: () => analyticsApi.anomalies(productId, 60).then(r => r.data),
    enabled: !!productId && tab === 'Anomalies'
  });

  const elasticityQuery = useQuery({
    queryKey: ['elasticity', productId],
    queryFn: () => analyticsApi.elasticity(productId).then(r => r.data),
    enabled: !!productId && tab === 'Elasticity'
  });

  const whatifMutation = useMutation({
    mutationFn: () => analyticsApi.whatif(productId, WHATIF_PRESETS).then(r => r.data),
    onError: (e) => toast.error(e.message)
  });

  const perfQuery = useQuery({
    queryKey: ['monitor-perf'],
    queryFn: () => analyticsApi.performance(30).then(r => r.data),
    enabled: tab === 'Monitoring'
  });

  const driftQuery = useQuery({
    queryKey: ['monitor-drift'],
    queryFn: () => analyticsApi.drift().then(r => r.data),
    enabled: tab === 'Monitoring'
  });

  const auditQuery = useQuery({
    queryKey: ['audit', productId],
    queryFn: () => analyticsApi.audit(productId || null, 20).then(r => r.data),
    enabled: tab === 'Monitoring'
  });

  const ppoMutation = useMutation({
    mutationFn: () => analyticsApi.trainPPO(),
    onSuccess: (r) => toast.success(`PPO trained — Avg Reward: ${r.data?.metrics?.final_avg_reward}`),
    onError: (e) => toast.error(e.message)
  });

  const decomp = decompQuery.data;
  const anomaly = anomalyQuery.data;
  const elastic = elasticityQuery.data;
  const whatif = whatifMutation.data;
  const perf = perfQuery.data;
  const drift = driftQuery.data;
  const audit = auditQuery.data;

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Advanced Analytics</h1>
        <p className={styles.subtitle}>STL decomposition · Anomaly detection · Price elasticity · What-if simulator · Model monitoring</p>
      </motion.div>

      {/* Product selector */}
      <div className={styles.controls}>
        <select className={styles.select} value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Select a product</option>
          {products?.map(p => <option key={p._id} value={p._id}>{p.name} ({p.category})</option>)}
        </select>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button key={t} className={styles.tab} data-active={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* STL Decomposition */}
        {tab === 'Decomposition' && (
          <motion.div key="decomp" className={styles.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {!productId ? <div className={styles.empty}>Select a product to see demand decomposition</div> :
             decompQuery.isLoading ? <div className={styles.loading}>Decomposing time series...</div> :
             decomp ? (
              <>
                <div className={styles.metaRow}>
                  <span className={styles.metaBadge} data-type={decomp.trend_direction === 'increasing' ? 'positive' : 'negative'}>
                    Trend: {decomp.trend_direction} ↑
                  </span>
                  <span className={styles.metaBadge}>Seasonality Strength: {(decomp.seasonality_strength * 100).toFixed(0)}%</span>
                  <span className={styles.metaBadge}>{decomp.data_points} data points</span>
                </div>
                <div className={styles.chartGrid}>
                  {[
                    { label: 'Observed', key: 'observed', color: '#6366f1' },
                    { label: 'Trend', key: 'trend', color: '#10b981' },
                    { label: 'Seasonal', key: 'seasonal', color: '#f59e0b' },
                    { label: 'Residual', key: 'residual', color: '#ef4444' }
                  ].map(({ label, key, color }) => (
                    <div key={key} className={styles.card}>
                      <div className={styles.cardTitle}>{label} Component</div>
                      <Line data={{
                        labels: decomp.dates?.filter((_, i) => i % 3 === 0),
                        datasets: [{ label, data: decomp[key]?.filter((_, i) => i % 3 === 0), borderColor: color, backgroundColor: color + '15', fill: true, tension: 0.4, pointRadius: 0 }]
                      }} options={chartOpts(label)} />
                    </div>
                  ))}
                </div>
              </>
             ) : <div className={styles.empty}>No data available</div>}
          </motion.div>
        )}

        {/* Anomaly Detection */}
        {tab === 'Anomalies' && (
          <motion.div key="anomaly" className={styles.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {!productId ? <div className={styles.empty}>Select a product to detect anomalies</div> :
             anomalyQuery.isLoading ? <div className={styles.loading}>Running Isolation Forest...</div> :
             anomaly ? (
              <>
                <div className={styles.metaRow}>
                  <span className={styles.metaBadge} data-type={anomaly.flagged_days > 0 ? 'warning' : 'positive'}>
                    {anomaly.flagged_days} anomalies detected
                  </span>
                  <span className={styles.metaBadge}>Anomaly Rate: {(anomaly.anomaly_rate * 100).toFixed(1)}%</span>
                  <span className={styles.metaBadge}>{anomaly.total_days} days analyzed</span>
                </div>
                {anomaly.all_scores?.length > 0 && (
                  <div className={styles.card}>
                    <div className={styles.cardTitle}>Anomaly Scores (Isolation Forest)</div>
                    <Bar data={{
                      labels: anomaly.all_scores.map(s => s.date),
                      datasets: [{
                        label: 'Anomaly Score',
                        data: anomaly.all_scores.map(s => s.score),
                        backgroundColor: anomaly.all_scores.map(s => s.is_anomaly ? 'rgba(239,68,68,0.7)' : 'rgba(99,102,241,0.4)'),
                        borderRadius: 3
                      }]
                    }} options={chartOpts('Anomaly Scores')} />
                  </div>
                )}
                {anomaly.anomalies?.length > 0 && (
                  <div className={styles.card}>
                    <div className={styles.cardTitle}>Flagged Dates</div>
                    <div className={styles.anomalyList}>
                      {anomaly.anomalies.map((a, i) => (
                        <div key={i} className={styles.anomalyItem} data-severity={a.severity}>
                          <span>{a.date}</span>
                          <span>{a.quantity} units</span>
                          <span className={styles.severityBadge} data-s={a.severity}>{a.severity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
             ) : null}
          </motion.div>
        )}

        {/* Price Elasticity */}
        {tab === 'Elasticity' && (
          <motion.div key="elastic" className={styles.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {!productId ? <div className={styles.empty}>Select a product to estimate price elasticity</div> :
             elasticityQuery.isLoading ? <div className={styles.loading}>Estimating elasticity...</div> :
             elastic ? (
              <div className={styles.elasticityCard}>
                <div className={styles.elasticityValue}>{elastic.elasticity}</div>
                <div className={styles.elasticityLabel}>Price Elasticity of Demand</div>
                <div className={styles.elasticityInterpret}>{elastic.interpretation}</div>
                <div className={styles.elasticityMeta}>
                  <span>R² = {elastic.r2}</span>
                  <span>Confidence: {elastic.confidence}</span>
                  <span>{elastic.data_points} data points</span>
                </div>
                <div className={styles.elasticityGuide}>
                  <div className={styles.guideItem}><span className={styles.guideBar} style={{ width: '30%', background: '#10b981' }} /><span>Inelastic (0 to -1)</span></div>
                  <div className={styles.guideItem}><span className={styles.guideBar} style={{ width: '60%', background: '#f59e0b' }} /><span>Elastic (-1 to -2)</span></div>
                  <div className={styles.guideItem}><span className={styles.guideBar} style={{ width: '100%', background: '#ef4444' }} /><span>Highly Elastic (&lt; -2)</span></div>
                </div>
              </div>
             ) : null}
          </motion.div>
        )}

        {/* What-If Simulator */}
        {tab === 'What-If' && (
          <motion.div key="whatif" className={styles.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>What-If Price & Trend Simulator</div>
              <p className={styles.muted}>Simulate how price changes and market trends affect demand and revenue.</p>
              <button className={styles.btnPrimary} onClick={() => { if (productId) whatifMutation.mutate(); else toast.error('Select a product first'); }}
                disabled={whatifMutation.isPending}>
                {whatifMutation.isPending ? 'Simulating...' : '▶ Run All Scenarios'}
              </button>
            </div>
            {whatif && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Scenario Results — Base: {whatif.base_demand} units / ${whatif.base_revenue}</div>
                <table className={styles.table}>
                  <thead><tr><th>Scenario</th><th>New Price</th><th>Demand</th><th>Δ Demand</th><th>Revenue</th><th>Δ Revenue</th><th>Action</th></tr></thead>
                  <tbody>
                    {whatif.scenarios?.map((s, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                        <td>{s.scenario_name}</td>
                        <td>${s.new_price}</td>
                        <td>{s.predicted_demand}</td>
                        <td style={{ color: s.demand_change_pct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {s.demand_change_pct > 0 ? '+' : ''}{s.demand_change_pct}%
                        </td>
                        <td>${s.new_revenue}</td>
                        <td style={{ color: s.revenue_change_pct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {s.revenue_change_pct > 0 ? '+' : ''}{s.revenue_change_pct}%
                        </td>
                        <td><span className={styles.recBadge} data-rec={s.recommendation}>{s.recommendation}</span></td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Monitoring */}
        {tab === 'Monitoring' && (
          <motion.div key="monitor" className={styles.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={styles.monitorGrid}>
              {/* Performance */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Model Performance (30 days)</div>
                {perf?.records === 0 ? (
                  <p className={styles.muted}>No feedback data yet. Record actual demand via the feedback API to track accuracy.</p>
                ) : perf ? (
                  <div className={styles.perfGrid}>
                    <div className={styles.perfItem}><span className={styles.perfVal}>{perf.mae}</span><span className={styles.perfLabel}>MAE</span></div>
                    <div className={styles.perfItem}><span className={styles.perfVal}>{perf.mape}%</span><span className={styles.perfLabel}>MAPE</span></div>
                    <div className={styles.perfItem}><span className={styles.perfVal}>{perf.r2}</span><span className={styles.perfLabel}>R²</span></div>
                    <div className={styles.perfItem}><span className={styles.perfVal}>{perf.records}</span><span className={styles.perfLabel}>Predictions</span></div>
                  </div>
                ) : <div className={styles.loading}>Loading...</div>}
              </div>

              {/* Drift */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Model Drift Detection (PSI)</div>
                {drift ? (
                  <>
                    <div className={styles.driftStatus} data-drift={drift.drift_detected}>
                      {drift.drift_detected ? '⚠️ Drift Detected' : '✅ Model Stable'}
                    </div>
                    <div className={styles.driftMeta}>
                      <span>PSI: {drift.psi} (threshold: {drift.psi_threshold})</span>
                      <span>Confidence drop: {drift.confidence_drop}</span>
                    </div>
                    {drift.alerts?.map((a, i) => (
                      <div key={i} className={styles.driftAlert}>{a}</div>
                    ))}
                    <div className={styles.driftRec}>{drift.recommendation}</div>
                    <button className={styles.btnSecondary} onClick={() => ppoMutation.mutate()} disabled={ppoMutation.isPending} style={{ marginTop: 12 }}>
                      {ppoMutation.isPending ? '🔄 Training PPO...' : '🧠 Retrain PPO Agent'}
                    </button>
                  </>
                ) : <div className={styles.loading}>Checking drift...</div>}
              </div>
            </div>

            {/* Audit log */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Prediction Audit Log</div>
              {!audit?.length ? <p className={styles.muted}>No predictions logged yet.</p> : (
                <table className={styles.table}>
                  <thead><tr><th>Time</th><th>Product</th><th>Predicted</th><th>Actual</th><th>Method</th><th>Confidence</th></tr></thead>
                  <tbody>
                    {audit.map((r, i) => (
                      <tr key={i}>
                        <td className={styles.muted}>{new Date(r.timestamp).toLocaleString()}</td>
                        <td>{r.product_name}</td>
                        <td>{r.predicted_demand}</td>
                        <td>{r.actual_demand ?? <span className={styles.muted}>—</span>}</td>
                        <td className={styles.muted}>{r.method}</td>
                        <td>{r.confidence_score ? `${(r.confidence_score * 100).toFixed(0)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
