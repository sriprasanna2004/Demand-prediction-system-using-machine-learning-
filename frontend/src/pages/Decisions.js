import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { productsApi, vizApi, rlApi } from '../api/client';
import { useDatasetProducts } from '../hooks/useDatasetProducts';
import styles from './Decisions.module.css';

const SCENARIOS = [
  { key: 'peak_hour',  label: '🔥 Peak Hour',     desc: 'High traffic, strong demand' },
  { key: 'rainy_day',  label: '🌧 Rainy Day',      desc: 'Low footfall, reduced demand' },
  { key: 'festival',   label: '🎉 Festival Surge', desc: 'Extreme demand spike' },
  { key: 'low_demand', label: '📉 Low Demand',     desc: 'Slow period, excess stock risk' }
];

const ACTION_COLORS = {
  WAIT: 'var(--muted)',
  REORDER: 'var(--accent)',
  URGENT_REORDER: 'var(--danger)',
  DISCOUNT: 'var(--warning)',
  MONITOR: '#22d3ee'
};

export default function Decisions() {
  const [productId, setProductId] = useState('');
  const [decision, setDecision] = useState(null);
  const [scenarioResult, setScenarioResult] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);

  const { products, activeDataset } = useDatasetProducts();

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ['rl-batch'],
    queryFn: () => rlApi.batchDecide().then(r => r.data),
    refetchInterval: 120000
  });

  const decideMutation = useMutation({
    mutationFn: () => rlApi.decide(productId),
    onSuccess: (res) => setDecision(res.data),
    onError: (e) => toast.error(e.message)
  });

  const scenarioMutation = useMutation({
    mutationFn: (scenario) => rlApi.scenario(productId, scenario),
    onSuccess: (res) => { setScenarioResult(res.data); setActiveScenario(res.data.scenario); },
    onError: (e) => toast.error(e.message)
  });

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>RL Decision Engine</h1>
        <p className={styles.subtitle}>PPO-powered inventory optimization with scenario simulation</p>
      </motion.div>

      <div className={styles.topGrid}>
        {/* Decision panel */}
        <motion.div className={styles.card} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className={styles.cardTitle}>Run Decision</h2>
          <select className={styles.select} value={productId} onChange={e => setProductId(e.target.value)}>
            <option value="">Select a product</option>
            {products?.map(p => <option key={p._id} value={p._id}>{p.name} ({p.category})</option>)}
          </select>
          <button className={styles.btnPrimary} onClick={() => decideMutation.mutate()}
            disabled={!productId || decideMutation.isPending}>
            {decideMutation.isPending ? 'Analyzing...' : 'Get AI Decision'}
          </button>

          <AnimatePresence>
            {decision && (
              <motion.div className={styles.decisionResult}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className={styles.actionBadge} style={{ background: ACTION_COLORS[decision.action] + '22', color: ACTION_COLORS[decision.action], borderColor: ACTION_COLORS[decision.action] }}>
                  {decision.action}
                </div>
                <p className={styles.actionLabel}>{decision.label}</p>
                {decision.reorder_quantity > 0 && (
                  <div className={styles.reorderQty}>Order <strong>{decision.reorder_quantity}</strong> units</div>
                )}
                {decision.method && (
                  <div className={styles.methodBadge}>via {decision.method.replace(/_/g, ' ')}</div>
                )}
                {decision.state?.days_of_supply != null && (
                  <div className={styles.dosRow}>
                    Days of supply: <strong>{decision.state.days_of_supply}d</strong>
                  </div>
                )}
                <div className={styles.reasoningList}>
                  {decision.reasoning?.map((r, i) => (
                    <motion.div key={i} className={styles.reasonItem}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                      <span className={styles.reasonDot} />
                      {r}
                    </motion.div>
                  ))}
                </div>
                <div className={styles.probGrid}>
                  {Object.entries(decision.probabilities || {}).map(([action, prob]) => (
                    <div key={action} className={styles.probItem}>
                      <span className={styles.probLabel}>{action}</span>
                      <div className={styles.probBar}>
                        <div className={styles.probFill} style={{ width: `${prob * 100}%`, background: ACTION_COLORS[action] }} />
                      </div>
                      <span className={styles.probVal}>{(prob * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Scenario panel */}
        <motion.div className={styles.card} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className={styles.cardTitle}>Scenario Simulation</h2>
          <p className={styles.hint}>Select a product above, then run a scenario</p>
          <div className={styles.scenarioGrid}>
            {SCENARIOS.map(s => (
              <motion.button key={s.key} className={styles.scenarioBtn}
                data-active={activeScenario === s.key}
                onClick={() => { if (productId) scenarioMutation.mutate(s.key); else toast.error('Select a product first'); }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <span className={styles.scenarioLabel}>{s.label}</span>
                <span className={styles.scenarioDesc}>{s.desc}</span>
              </motion.button>
            ))}
          </div>
          <AnimatePresence>
            {scenarioResult && (
              <motion.div className={styles.scenarioResult}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className={styles.scenarioResultHeader}>
                  <span>{SCENARIOS.find(s => s.key === scenarioResult.scenario)?.label}</span>
                  <span className={styles.multiplierBadge}>{scenarioResult.multiplier}x demand</span>
                </div>
                <div className={styles.scenarioDemand}>
                  <div className={styles.demandItem}>
                    <span className={styles.demandLabel}>Base Demand</span>
                    <span>{scenarioResult.base_demand} units</span>
                  </div>
                  <div className={styles.demandArrow}>→</div>
                  <div className={styles.demandItem}>
                    <span className={styles.demandLabel}>Scenario Demand</span>
                    <span className={styles.demandHighlight}>{scenarioResult.predicted_demand} units</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Batch decisions table */}
      <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <h2 className={styles.cardTitle}>Fleet Decisions — All Products</h2>
        {batchLoading ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonCell} style={{ width: '30%' }} />
                <div className={styles.skeletonCell} style={{ width: '10%' }} />
                <div className={styles.skeletonCell} style={{ width: '20%' }} />
                <div className={styles.skeletonCell} style={{ width: '12%' }} />
                <div className={styles.skeletonCell} style={{ width: '15%' }} />
              </div>
            ))}
          </div>
        ) : !batchData?.length ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
            No products found. Add products to see fleet decisions.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Action</th><th>Reorder Qty</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {batchData?.map((row, i) => (
                <motion.tr key={row.productId} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <td>{row.name}</td>
                  <td>{row.stock}</td>
                  <td>
                    <span className={styles.actionTag} style={{ color: ACTION_COLORS[row.action], borderColor: ACTION_COLORS[row.action] + '44', background: ACTION_COLORS[row.action] + '11' }}>
                      {row.action}
                    </span>
                  </td>
                  <td>{row.reorder_quantity > 0 ? row.reorder_quantity : '—'}</td>
                  <td>
                    <div className={styles.miniBar}>
                      <div style={{ width: `${(row.reward / 5) * 100}%`, background: 'var(--accent)', height: '100%', borderRadius: 2 }} />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
}



