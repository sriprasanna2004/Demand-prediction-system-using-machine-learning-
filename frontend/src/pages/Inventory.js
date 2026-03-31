import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { productsApi, predictApi, analyticsApi } from '../api/client';
import styles from './Inventory.module.css';

export default function Inventory() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll().then((r) => r.data)
  });

  const { data: batchPredictions } = useQuery({
    queryKey: ['batch-predict'],
    queryFn: () => predictApi.batchPredict().then((r) => r.data),
    refetchInterval: 120000
  });

  const { data: batchMLPredictions } = useQuery({
    queryKey: ['batch-ml-predictions'],
    queryFn: () => analyticsApi.batchPredictions(100).then(r => r.data),
    refetchInterval: 300000
  });

  // Map predictions by productId
  const predMap = {};
  batchPredictions?.forEach((p) => { predMap[p.productId] = p; });

  // Map ML batch predictions (with stockout risk + days of supply)
  const mlPredMap = {};
  batchMLPredictions?.forEach((p) => { mlPredMap[p.product_id] = p; });

  const getStatus = (stock, predicted) => {
    if (!predicted) return { label: 'Unknown', color: 'var(--muted)' };
    if (stock < predicted * 0.5) return { label: 'UNDERSTOCK', color: 'var(--danger)' };
    if (stock > predicted * 2) return { label: 'OVERSTOCK', color: 'var(--warning)' };
    return { label: 'OPTIMAL', color: 'var(--success)' };
  };

  const understocked = products?.filter((p) => {
    const pred = predMap[p._id]?.predicted_demand;
    return pred && p.stock < pred * 0.5;
  }) || [];

  const overstocked = products?.filter((p) => {
    const pred = predMap[p._id]?.predicted_demand;
    return pred && p.stock > pred * 2;
  }) || [];

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Inventory Optimization</h1>
        <p className={styles.subtitle}>AI-driven stock recommendations based on predicted demand</p>
      </motion.div>

      <div className={styles.alertRow}>
        <div className={styles.alertCard} data-type="danger">
          <div className={styles.alertIcon}>📉</div>
          <div>
            <div className={styles.alertCount}>{understocked.length}</div>
            <div className={styles.alertLabel}>Understocked Products</div>
          </div>
        </div>
        <div className={styles.alertCard} data-type="warning">
          <div className={styles.alertIcon}>📦</div>
          <div>
            <div className={styles.alertCount}>{overstocked.length}</div>
            <div className={styles.alertLabel}>Overstocked Products</div>
          </div>
        </div>
        <div className={styles.alertCard} data-type="success">
          <div className={styles.alertIcon}>✅</div>
          <div>
            <div className={styles.alertCount}>
              {(products?.length || 0) - understocked.length - overstocked.length}
            </div>
            <div className={styles.alertLabel}>Optimally Stocked</div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Stock Optimization Table</h2>
        {isLoading ? (
          <p className={styles.muted}>Loading inventory data...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Predicted Demand</th>
                <th>Days of Supply</th>
                <th>Stockout Risk</th>
                <th>Recommended Stock</th>
                <th>Gap</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p) => {
                const pred = predMap[p._id];
                const mlPred = mlPredMap[p._id];
                const demand = pred?.predicted_demand || 0;
                const recommended = demand ? Math.ceil(demand * 1.2) : null;
                const gap = recommended ? recommended - p.stock : null;
                const status = getStatus(p.stock, demand);
                const daysOfSupply = mlPred?.days_of_supply ?? (demand > 0 ? Math.round(p.stock / (demand / 30)) : null);
                const stockoutRisk = mlPred?.stockout_risk;

                return (
                  <tr key={p._id}>
                    <td className={styles.productName}>{p.name}</td>
                    <td><span className={styles.catBadge}>{p.category}</span></td>
                    <td className={styles.stockCell}>{p.stock}</td>
                    <td>{demand ? `${demand} units` : <span className={styles.muted}>—</span>}</td>
                    <td>
                      {daysOfSupply != null ? (
                        <span style={{ color: daysOfSupply < 7 ? 'var(--danger)' : daysOfSupply < 14 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                          {daysOfSupply}d
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {stockoutRisk != null ? (
                        <div className={styles.riskBar}>
                          <div className={styles.riskFill} style={{
                            width: `${stockoutRisk * 100}%`,
                            background: stockoutRisk > 0.6 ? 'var(--danger)' : stockoutRisk > 0.3 ? 'var(--warning)' : 'var(--success)'
                          }} />
                          <span className={styles.riskLabel}>{(stockoutRisk * 100).toFixed(0)}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td>{recommended ?? <span className={styles.muted}>—</span>}</td>
                    <td>
                      {gap !== null ? (
                        <span style={{ color: gap > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                          {gap > 0 ? `+${gap} needed` : `${Math.abs(gap)} excess`}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={styles.statusBadge} style={{ color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {understocked.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>⚠️ Urgent Reorder Recommendations</h2>
          <div className={styles.reorderGrid}>
            {understocked.map((p) => {
              const pred = predMap[p._id];
              return (
                <div key={p._id} className={styles.reorderCard}>
                  <div className={styles.reorderName}>{p.name}</div>
                  <div className={styles.reorderDetail}>
                    Current: <strong>{p.stock}</strong> | Need: <strong>{Math.ceil((pred?.predicted_demand || 0) * 1.2)}</strong>
                  </div>
                  <div className={styles.reorderInsight}>
                    Order at least <strong>{Math.ceil((pred?.predicted_demand || 0) * 1.2) - p.stock}</strong> units immediately
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
