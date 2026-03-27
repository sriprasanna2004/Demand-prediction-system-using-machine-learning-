import { useQuery } from '@tanstack/react-query';
import { productsApi, predictApi } from '../api/client';
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

  // Map predictions by productId
  const predMap = {};
  batchPredictions?.forEach((p) => { predMap[p.productId] = p; });

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
      <h1 className={styles.title}>Inventory Optimization</h1>
      <p className={styles.subtitle}>AI-driven stock recommendations based on predicted demand</p>

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
                <th>Current Stock</th>
                <th>Predicted Demand</th>
                <th>Recommended Stock</th>
                <th>Gap</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p) => {
                const pred = predMap[p._id];
                const demand = pred?.predicted_demand || 0;
                const recommended = demand ? Math.ceil(demand * 1.2) : null;
                const gap = recommended ? recommended - p.stock : null;
                const status = getStatus(p.stock, demand);

                return (
                  <tr key={p._id}>
                    <td className={styles.productName}>{p.name}</td>
                    <td><span className={styles.catBadge}>{p.category}</span></td>
                    <td className={styles.stockCell}>{p.stock}</td>
                    <td>{demand ? `${demand} units` : <span className={styles.muted}>—</span>}</td>
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
                    <td>
                      {gap > 0 && (
                        <span className={styles.actionTag} data-action="reorder">Reorder</span>
                      )}
                      {gap !== null && gap < -20 && (
                        <span className={styles.actionTag} data-action="discount">Discount</span>
                      )}
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
