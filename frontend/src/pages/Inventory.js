import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { productsApi, predictApi, analyticsApi } from '../api/client';
import styles from './Inventory.module.css';

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('status'); // status | stock | demand | risk
  const [filterStatus, setFilterStatus] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll().then(r => r.data)
  });
  const { data: batchPredictions } = useQuery({
    queryKey: ['batch-predict'],
    queryFn: () => predictApi.batchPredict().then(r => r.data),
    refetchInterval: 120000
  });
  const { data: batchMLPredictions } = useQuery({
    queryKey: ['batch-ml-predictions'],
    queryFn: () => analyticsApi.batchPredictions(100).then(r => r.data),
    refetchInterval: 300000
  });

  const predMap = {};
  batchPredictions?.forEach(p => { predMap[p.productId] = p; });
  const mlPredMap = {};
  batchMLPredictions?.forEach(p => { mlPredMap[p.product_id] = p; });

  const getStatus = (stock, predicted) => {
    if (!predicted) return { label: 'Unknown', color: 'var(--muted)', rank: 3 };
    if (stock < predicted * 0.5) return { label: 'UNDERSTOCK', color: 'var(--danger)', rank: 0 };
    if (stock > predicted * 2)   return { label: 'OVERSTOCK',  color: 'var(--warning)', rank: 1 };
    return { label: 'OPTIMAL', color: 'var(--success)', rank: 2 };
  };

  const rows = useMemo(() => {
    if (!products) return [];
    return products.map(p => {
      const pred    = predMap[p._id];
      const mlPred  = mlPredMap[p._id];
      const demand  = pred?.predicted_demand || 0;
      const recommended = demand ? Math.ceil(demand * 1.2) : null;
      const gap     = recommended ? recommended - p.stock : null;
      const status  = getStatus(p.stock, demand);
      const daysOfSupply = mlPred?.days_of_supply ?? (demand > 0 ? Math.round(p.stock / (demand / 30)) : null);
      const stockoutRisk = mlPred?.stockout_risk ?? null;
      return { ...p, demand, recommended, gap, status, daysOfSupply, stockoutRisk };
    });
  }, [products, batchPredictions, batchMLPredictions]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search)       r = r.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus) r = r.filter(p => p.status.label === filterStatus);
    return [...r].sort((a, b) => {
      if (sortBy === 'stock')  return a.stock - b.stock;
      if (sortBy === 'demand') return b.demand - a.demand;
      if (sortBy === 'risk')   return (b.stockoutRisk ?? 0) - (a.stockoutRisk ?? 0);
      return a.status.rank - b.status.rank; // default: status
    });
  }, [rows, search, filterStatus, sortBy]);

  const understocked = rows.filter(p => p.status.label === 'UNDERSTOCK');
  const overstocked  = rows.filter(p => p.status.label === 'OVERSTOCK');
  const optimal      = rows.filter(p => p.status.label === 'OPTIMAL');

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h2 className={styles.cardTitle} style={{ margin: 0 }}>Stock Optimization Table</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className={styles.searchInput} placeholder="🔍 Search..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="UNDERSTOCK">Understock</option>
              <option value="OPTIMAL">Optimal</option>
              <option value="OVERSTOCK">Overstock</option>
            </select>
            <select className={styles.filterSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="status">Sort: Status</option>
              <option value="stock">Sort: Stock ↑</option>
              <option value="demand">Sort: Demand ↓</option>
              <option value="risk">Sort: Risk ↓</option>
            </select>
          </div>
        </div>
        {isLoading ? (
          <p className={styles.muted}>Loading inventory data...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th><th>Category</th><th>Stock</th>
                <th>Predicted Demand</th><th>Days of Supply</th>
                <th>Stockout Risk</th><th>Recommended</th><th>Gap</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p._id}>
                  <td className={styles.productName}>{p.name}</td>
                  <td><span className={styles.catBadge}>{p.category}</span></td>
                  <td className={styles.stockCell}>{p.stock}</td>
                  <td>{p.demand ? `${p.demand} units` : <span className={styles.muted}>—</span>}</td>
                  <td>
                    {p.daysOfSupply != null ? (
                      <span style={{ color: p.daysOfSupply < 7 ? 'var(--danger)' : p.daysOfSupply < 14 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                        {p.daysOfSupply}d
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {p.stockoutRisk != null ? (
                      <div className={styles.riskBar}>
                        <div className={styles.riskFill} style={{
                          width: `${p.stockoutRisk * 100}%`,
                          background: p.stockoutRisk > 0.6 ? 'var(--danger)' : p.stockoutRisk > 0.3 ? 'var(--warning)' : 'var(--success)'
                        }} />
                        <span className={styles.riskLabel}>{(p.stockoutRisk * 100).toFixed(0)}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td>{p.recommended ?? <span className={styles.muted}>—</span>}</td>
                  <td>
                    {p.gap !== null ? (
                      <span style={{ color: p.gap > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                        {p.gap > 0 ? `+${p.gap} needed` : `${Math.abs(p.gap)} excess`}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: p.status.color }}>{p.status.label}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No products match filters</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {understocked.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>⚠️ Urgent Reorder Recommendations</h2>
          <div className={styles.reorderGrid}>
            {understocked.map(p => (
              <div key={p._id} className={styles.reorderCard}>
                <div className={styles.reorderName}>{p.name}</div>
                <div className={styles.reorderDetail}>
                  Current: <strong>{p.stock}</strong> | Need: <strong>{p.recommended || 0}</strong>
                </div>
                <div className={styles.reorderInsight}>
                  Order at least <strong>{Math.max(0, (p.recommended || 0) - p.stock)}</strong> units immediately
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
