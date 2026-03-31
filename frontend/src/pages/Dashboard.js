import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { insightsApi, externalApi } from '../api/client';
import { useSocket } from '../context/SocketContext';
import SalesChart from '../components/SalesChart';
import StatCard from '../components/StatCard';
import LiveFeed from '../components/LiveFeed';
import InsightBanner from '../components/InsightBanner';
import Skeleton from '../components/Skeleton';
import TopProductsChart from '../components/TopProductsChart';
import styles from './Dashboard.module.css';

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };
const stagger = { show: { transition: { staggerChildren: 0.08 } } };

export default function Dashboard() {
  const { connected, dashboardUpdate, lastSale } = useSocket();
  const queryClient = useQueryClient();
  const [liveSales, setLiveSales] = useState([]);

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: () => insightsApi.getSummary().then((r) => r.data),
    refetchInterval: 60000
  });

  const { data: timeseries, isLoading: timeseriesLoading } = useQuery({
    queryKey: ['timeseries'],
    queryFn: () => insightsApi.getTimeseries(14).then((r) => r.data),
    refetchInterval: 30000
  });

  const { data: external } = useQuery({
    queryKey: ['external'],
    queryFn: () => externalApi.getLatest().then((r) => r.data),
    refetchInterval: 120000
  });

  useEffect(() => {
    if (lastSale) {
      setLiveSales((prev) => [lastSale, ...prev].slice(0, 20));
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    }
  }, [lastSale, queryClient]);

  const todayStats = dashboardUpdate?.todayStats || {};
  const lowStock = dashboardUpdate?.lowStockAlerts || insights?.lowStockAlerts || [];
  const bm = insights?.businessMetrics || {};

  return (
    <div className={styles.page}>
      <motion.div className={styles.header} initial="hidden" animate="show" variants={fadeUp}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Real-time demand intelligence</p>
        </div>
        <div className={styles.statusBadge} data-connected={connected}>
          <span className={styles.dot} />
          {connected ? 'Live' : 'Reconnecting...'}
        </div>
      </motion.div>

      {insights?.insights?.map((msg, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
          <InsightBanner message={msg} />
        </motion.div>
      ))}

      {/* Core stats */}
      <motion.div className={styles.statsGrid} variants={stagger} initial="hidden" animate="show">
        {insightsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" />) : (
          <>
            <motion.div variants={fadeUp}>
              <StatCard label="Sales Today" value={todayStats.qty || 0} unit="units" icon="📦" trend={insights?.demandChangePct} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Revenue Today" value={`$${(todayStats.revenue || 0).toFixed(0)}`} icon="💰" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Low Stock Alerts" value={lowStock.length} icon="⚠️" danger={lowStock.length > 0} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Demand Trend" value={`${insights?.demandChangePct > 0 ? '+' : ''}${insights?.demandChangePct || 0}%`} icon="📈" trend={insights?.demandChangePct} />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Business metrics */}
      <motion.div className={styles.sectionLabel} variants={fadeUp} initial="hidden" animate="show">
        Business Metrics
      </motion.div>
      <motion.div className={styles.statsGrid} variants={stagger} initial="hidden" animate="show">
        {insightsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" />) : (
          <>
            <motion.div variants={fadeUp}>
              <StatCard label="30-Day Profit" value={`$${bm.profit30Days || 0}`} icon="💹" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Cost Per Unit" value={`$${bm.costPerUnit || 0}`} icon="🏷️" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Idle Stock Cost" value={`$${bm.idleStockCost || 0}`} icon="📉" danger={(bm.idleStockCost || 0) > 1000} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Efficiency Score" value={`${bm.efficiencyScore || 0}%`} icon="⚡" trend={bm.efficiencyScore > 50 ? 1 : -1} />
            </motion.div>
          </>
        )}
      </motion.div>

      <motion.div className={styles.grid2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sales (Last 14 Days)</h2>
          {timeseriesLoading ? <Skeleton variant="row" count={5} height={20} /> : <SalesChart data={timeseries || []} />}
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Live Sales Feed</h2>
          <LiveFeed sales={liveSales} />
        </div>
      </motion.div>

      <motion.div className={styles.grid2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Top Products (Last 7 Days)</h2>
          <TopProductsChart products={insights?.topProducts} />
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Low Stock Alerts</h2>
          {lowStock.length === 0 ? (
            <p className={styles.empty}>All products adequately stocked.</p>
          ) : (
            <ul className={styles.alertList}>
              {lowStock.map((p) => (
                <motion.li key={p._id} className={styles.alertItem}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                  <span>{p.name}</span>
                  <span className={styles.stockBadge}>{p.stock} left</span>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>

      <motion.div className={styles.grid2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>External Signals</h2>
          {external ? (
            <div className={styles.externalGrid}>
              <div className={styles.externalItem}><span className={styles.exLabel}>🌡 Temperature</span><span>{external.weather?.temperature ?? 'N/A'}°C</span></div>
              <div className={styles.externalItem}><span className={styles.exLabel}>🌤 Weather</span><span>{external.weather?.weatherCondition ?? 'N/A'}</span></div>
              <div className={styles.externalItem}><span className={styles.exLabel}>📊 Market Trend</span><span>{external.trend?.trendScore?.toFixed(1) ?? 'N/A'} / 100</span></div>
              {(external.weather?.fromCache || external.trend?.fromCache) && <p className={styles.cacheNote}>Using cached external data</p>}
            </div>
          ) : <Skeleton variant="row" count={3} height={18} />}
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>30-Day Summary</h2>
          <div className={styles.externalGrid}>
            <div className={styles.externalItem}><span className={styles.exLabel}>Total Units Sold</span><span>{insights?.totalSalesLast30Days ?? '—'}</span></div>
            <div className={styles.externalItem}><span className={styles.exLabel}>Total Revenue</span><span>${(insights?.totalRevenueLast30Days || 0).toFixed(0)}</span></div>
            <div className={styles.externalItem}><span className={styles.exLabel}>Stock Value</span><span>${(bm.totalStockValue || 0).toFixed(0)}</span></div>
            <div className={styles.externalItem}>
              <span className={styles.exLabel}>Demand Change</span>
              <span style={{ color: (insights?.demandChangePct || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                {insights?.demandChangePct > 0 ? '+' : ''}{insights?.demandChangePct ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
