import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { analyticsApi } from '../api/client';
import api from '../api/client';
import styles from './ModelCard.module.css';

const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Furniture', 'Books', 'Toys'];
const TIERS = ['high', 'mid', 'low'];

function MetricBox({ label, value, unit = '', color = 'default', note }) {
  return (
    <div className={styles.metricBox} data-color={color}>
      <span className={styles.metricVal}>{value != null ? `${value}${unit}` : '—'}</span>
      <span className={styles.metricLabel}>{label}</span>
      {note && <span className={styles.metricNote}>{note}</span>}
    </div>
  );
}

function MapeBar({ label, value, max = 30 }) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  const color = value == null ? '#555' : value < 10 ? '#10b981' : value < 20 ? '#f59e0b' : '#ef4444';
  return (
    <div className={styles.mapeRow}>
      <span className={styles.mapeLabel}>{label}</span>
      <div className={styles.mapeBarWrap}>
        <div className={styles.mapeBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.mapeVal} style={{ color }}>
        {value != null ? `${value}%` : '—'}
      </span>
    </div>
  );
}

export default function ModelCard() {
  const { data: card, isLoading } = useQuery({
    queryKey: ['model-card'],
    queryFn: () => analyticsApi.modelCard(30).then(r => r.data),
    refetchInterval: 300000
  });

  const { data: experiments } = useQuery({
    queryKey: ['experiments'],
    queryFn: () => analyticsApi.experiments(10).then(r => r.data),
    refetchInterval: 300000
  });

  // Fetch ML service health to show model status
  const { data: mlHealth } = useQuery({
    queryKey: ['ml-health'],
    queryFn: () => api.get('/health').then(r => r),
    staleTime: 30000,
  });

  const overall = card?.overall || {};
  const mapeByCategory = card?.mape_by_category || {};
  const mapeByTier = card?.mape_by_tier || {};
  const noFeedback = !card || card.sample_count === 0;

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Model Card</h1>
        <p className={styles.subtitle}>
          Comprehensive evaluation — MAPE by category, demand tier, bias, service level & calibration
        </p>
      </motion.div>

      {/* ML Service Status */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={styles.cardTitle}>Model Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Active Model', value: mlHealth?.ml === 'connected' ? 'Random Forest' : 'Offline', color: mlHealth?.ml === 'connected' ? '#10b981' : '#ef4444' },
            { label: 'ML Service', value: mlHealth?.ml === 'connected' ? 'Connected' : 'Unavailable', color: mlHealth?.ml === 'connected' ? '#10b981' : '#ef4444' },
            { label: 'Database', value: mlHealth?.db === 'connected' ? 'Connected' : 'Offline', color: mlHealth?.db === 'connected' ? '#10b981' : '#ef4444' },
          ].map(m => (
            <div key={m.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* How to populate */}
      {noFeedback && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ padding: '16px 20px', borderRadius: 14, background: 'rgba(194,65,12,0.06)', border: '1px solid rgba(194,65,12,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c', marginBottom: 8 }}>How to populate Model Card metrics</div>
          <ol style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
            <li>Go to <strong style={{ color: '#fb923c' }}>Predictions</strong> page and run predictions for your products</li>
            <li>In the batch table, click <strong style={{ color: '#fb923c' }}>Record Actual</strong> next to each product</li>
            <li>Enter the real demand that occurred — the model compares predicted vs actual</li>
            <li>After 5+ feedback entries, MAE, MAPE, R² and all metrics will appear here</li>
          </ol>
        </motion.div>
      )}

      {card?.note && !noFeedback && (
        <div className={styles.infoBox}>{card.note}</div>
      )}

      {/* Overall metrics */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <div className={styles.cardTitle}>Overall Performance</div>
        <div className={styles.metricsGrid}>
          <MetricBox label="MAE" value={overall.mae} color={overall.mae < 5 ? 'green' : overall.mae < 15 ? 'yellow' : 'red'} />
          <MetricBox label="MAPE" value={overall.mape} unit="%" color={overall.mape < 10 ? 'green' : overall.mape < 20 ? 'yellow' : 'red'} />
          <MetricBox label="Forecast Bias" value={overall.bias_pct} unit="%" note={overall.bias_pct > 5 ? 'Over-predicting' : overall.bias_pct < -5 ? 'Under-predicting' : 'Well-calibrated'} color={Math.abs(overall.bias_pct || 0) < 5 ? 'green' : 'yellow'} />
          <MetricBox label="Service Level" value={overall.service_level_pct} unit="%" color={overall.service_level_pct >= 80 ? 'green' : 'red'} note={card?.service_level_status} />
          <MetricBox label="Calibration" value={overall.calibration_accuracy_pct} unit="%" color={overall.calibration_accuracy_pct >= 85 ? 'green' : 'yellow'} note="% actuals within CI" />
          <MetricBox label="Trend" value={overall.trend} color={overall.trend === 'improving' ? 'green' : overall.trend === 'degrading' ? 'red' : 'default'} />
        </div>
        <div className={styles.biasRow}>
          <span className={styles.biasLabel}>Bias interpretation:</span>
          <span className={styles.biasValue}>{card?.bias_interpretation || '—'}</span>
        </div>
        <div className={styles.slRow}>
          <span>Service level target: <strong>80%</strong></span>
          <span>Achieved: <strong style={{ color: overall.service_level_pct >= 80 ? '#10b981' : '#ef4444' }}>
            {overall.service_level_pct != null ? `${overall.service_level_pct}%` : '—'}
          </strong></span>
          <span>{card?.service_level_status}</span>
        </div>
      </motion.div>

      {/* MAPE by category */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
        <div className={styles.cardTitle}>MAPE by Category</div>
        <div className={styles.mapeList}>
          {CATEGORIES.map(cat => (
            <MapeBar key={cat} label={cat} value={mapeByCategory[cat]} />
          ))}
          {Object.keys(mapeByCategory).filter(k => !CATEGORIES.includes(k)).map(cat => (
            <MapeBar key={cat} label={cat} value={mapeByCategory[cat]} />
          ))}
        </div>
      </motion.div>

      {/* MAPE by demand tier */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <div className={styles.cardTitle}>MAPE by Demand Volume Tier</div>
        <div className={styles.tierGrid}>
          {TIERS.map(tier => (
            <div key={tier} className={styles.tierBox}>
              <span className={styles.tierLabel}>{tier.toUpperCase()} VOLUME</span>
              <span className={styles.tierVal} style={{
                color: mapeByTier[tier] == null ? '#555'
                  : mapeByTier[tier] < 10 ? '#10b981'
                  : mapeByTier[tier] < 20 ? '#f59e0b' : '#ef4444'
              }}>
                {mapeByTier[tier] != null ? `${mapeByTier[tier]}%` : '—'}
              </span>
              <span className={styles.tierNote}>MAPE</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Experiment history */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        <div className={styles.cardTitle}>Training Run History</div>
        {!experiments?.length ? (
          <p className={styles.muted}>No training runs logged yet. Train the model to populate.</p>
        ) : (
          <div className={styles.runList}>
            {experiments.map((run, i) => (
              <div key={run.run_id || i} className={styles.runRow}>
                <span className={styles.runId}>{(run.run_id || '').slice(0, 12)}</span>
                <span className={styles.runCat}>{run.category || 'global'}</span>
                <span className={styles.runMetric}>MAE: {run.metrics?.mae ?? run['metrics.mae'] ?? '—'}</span>
                <span className={styles.runMetric}>R²: {run.metrics?.r2 ?? run['metrics.r2'] ?? '—'}</span>
                <span className={styles.runMetric}>MAPE: {run.metrics?.mape ?? run['metrics.mape'] ?? '—'}%</span>
                <span className={styles.runTime}>{run.timestamp ? new Date(run.timestamp).toLocaleDateString() : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {isLoading && <p className={styles.muted}>Loading model card...</p>}
    </div>
  );
}
