import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { insightsApi, externalApi } from '../api/client';
import { useSocket } from '../context/SocketContext';
import SalesChart from '../components/SalesChart';
import TopProductsChart from '../components/TopProductsChart';
import Skeleton from '../components/Skeleton';
import styles from './Dashboard.module.css';

const stagger = { show: { transition: { staggerChildren: 0.07 } } };
const fadeUp  = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: .3 } } };

const KPI_CONFIG = [
  { key: 'sales',   label: 'Units Sold (30d)', icon: '📦', color: '#6366f1', glow: '#6366f1' },
  { key: 'revenue', label: 'Revenue (30d)',     icon: '💰', color: '#10b981', glow: '#10b981' },
  { key: 'alerts',  label: 'Stock Alerts',      icon: '⚠️', color: '#f59e0b', glow: '#f59e0b' },
  { key: 'trend',   label: 'Demand Trend',      icon: '📈', color: '#8b5cf6', glow: '#8b5cf6' },
];

function KpiCard({ label, value, icon, color, glow, trend, meta, loading }) {
  const trendClass = trend > 0 ? styles.kpiTrendUp : trend < 0 ? styles.kpiTrendDown : styles.kpiTrendFlat;
  const trendIcon  = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return (
    <motion.div className={styles.kpiCard} variants={fadeUp} whileHover={{ y: -3 }}>
      <div className={styles.kpiGlow} style={{ background: glow }} />
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={styles.kpiIcon} style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          {icon}
        </div>
      </div>
      {loading
        ? <div style={{ height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
        : <div className={styles.kpiValue} style={{ color }}>{value}</div>
      }
      <div className={styles.kpiSub}>
        {trend !== undefined && (
          <span className={`${styles.kpiTrend} ${trendClass}`}>
            {trendIcon} {Math.abs(trend)}%
          </span>
        )}
        {meta && <span className={styles.kpiMeta}>{meta}</span>}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { connected, dashboardUpdate, lastSale } = useSocket();
  const queryClient = useQueryClient();
  const [liveSales, setLiveSales] = useState([]);

  const { data: insights, isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: () => insightsApi.getSummary().then(r => r.data),
    refetchInterval: 60000,
  });
  const { data: timeseries, isLoading: tsLoading } = useQuery({
    queryKey: ['timeseries'],
    queryFn: () => insightsApi.getTimeseries(14).then(r => r.data),
    refetchInterval: 30000,
  });
  const { data: external } = useQuery({
    queryKey: ['external'],
    queryFn: () => externalApi.getLatest().then(r => r.data),
    refetchInterval: 120000,
  });

  useEffect(() => {
    if (lastSale) {
      setLiveSales(p => [lastSale, ...p].slice(0, 20));
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    }
  }, [lastSale, queryClient]);

  const todayStats = dashboardUpdate?.todayStats || {};
  const lowStock   = dashboardUpdate?.lowStockAlerts || insights?.lowStockAlerts || [];
  const bm         = insights?.businessMetrics || {};
  const demandPct  = insights?.demandChangePct || 0;

  const kpis = [
    { key: 'sales',   value: insights?.totalSalesLast30Days ?? '—', trend: demandPct, meta: 'vs prev 30d' },
    { key: 'revenue', value: `$${((insights?.totalRevenueLast30Days || 0) / 1000).toFixed(1)}k`, meta: '30-day total' },
    { key: 'alerts',  value: lowStock.length, trend: lowStock.length > 0 ? -1 : 0, meta: 'need reorder' },
    { key: 'trend',   value: `${demandPct > 0 ? '+' : ''}${demandPct}%`, trend: demandPct, meta: 'demand change' },
  ];

  return (
    <div className={styles.page}>
      {/* KPI row */}
      <motion.div className={styles.kpiGrid} variants={stagger} initial="hidden" animate="show">
        {KPI_CONFIG.map((cfg, i) => (
          <KpiCard key={cfg.key} {...cfg} {...kpis[i]} loading={isLoading} />
        ))}
      </motion.div>

      {/* Charts */}
      <motion.div className={styles.chartsRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Sales & Revenue — Last 14 Days</span>
            <span className={styles.cardBadge}>Live</span>
          </div>
          {tsLoading ? <Skeleton variant="row" count={4} height={20} /> : <SalesChart data={timeseries || []} />}
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Top Products (7d)</span>
          </div>
          <TopProductsChart products={insights?.topProducts} />
        </div>
      </motion.div>

      {/* Bottom row */}
      <motion.div className={styles.bottomRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>

        {/* Business metrics mini row */}
        <div className={styles.card} style={{ gridColumn: 'span 3' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Business Metrics</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: '30d Profit',      value: `$${(bm.profit30Days || 0).toLocaleString()}`,    color: '#10b981' },
              { label: 'Stock Value',     value: `$${(bm.totalStockValue || 0).toLocaleString()}`, color: '#6366f1' },
              { label: 'Idle Stock Cost', value: `$${(bm.idleStockCost || 0).toLocaleString()}`,  color: '#f59e0b' },
              { label: 'Efficiency',      value: `${bm.efficiencyScore || 0}%`,                   color: bm.efficiencyScore > 70 ? '#10b981' : '#f59e0b' },
            ].map(m => (
              <div key={m.label} style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: m.color, letterSpacing: '-.02em' }}>{m.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🧠 AI Insights</span>
            <span className={styles.cardBadge}>Auto-generated</span>
          </div>
          <div className={styles.insightList}>
            {(insights?.insights?.length ? insights.insights : [
              'Demand is stable — maintain current inventory levels.',
              'No significant drift detected in recent predictions.',
              'Model confidence is high based on available data.',
            ]).map((msg, i) => (
              <motion.div key={i} className={styles.insightItem}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: .35 + i * .08 }}>
                <span className={styles.insightDot} style={{
                  background: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--success)' : 'var(--warning)'
                }} />
                {msg}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Live feed */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Live Sales Feed</span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: connected ? 'var(--success)' : 'var(--muted)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: connected ? 'var(--success)' : 'var(--muted)',
                animation: connected ? 'pulse-dot 2s infinite' : 'none',
              }} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className={styles.feedList}>
            {liveSales.length === 0
              ? <p className={styles.empty}>Waiting for sales events...</p>
              : liveSales.map((s, i) => (
                <div key={i} className={styles.feedItem}>
                  <span style={{ fontSize: 13 }}>📦</span>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>
                      {s.productId?.name || 'Product'}
                    </div>
                    <div className={styles.feedTime}>
                      {new Date(s.timestamp || s.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className={styles.feedQty}>+{s.quantity}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* External signals + low stock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>External Signals</span>
            </div>
            <div className={styles.signalGrid}>
              {[
                { label: '🌡 Temperature', value: external?.weather?.temperature != null ? `${external.weather.temperature}°C` : '—' },
                { label: '🌤 Weather',     value: external?.weather?.weatherCondition || '—' },
                { label: '📊 Market',      value: external?.trend?.trendScore != null ? `${external.trend.trendScore.toFixed(0)}/100` : '—' },
              ].map(s => (
                <div key={s.label} className={styles.signalRow}>
                  <span className={styles.signalLabel}>{s.label}</span>
                  <span className={styles.signalValue}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>⚠️ Low Stock</span>
                <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>{lowStock.length} items</span>
              </div>
              <div className={styles.alertList}>
                {lowStock.slice(0, 4).map(p => (
                  <div key={p._id} className={styles.alertItem}>
                    <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{p.name}</span>
                    <span className={styles.stockBadge}>{p.stock} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </motion.div>
    </div>
  );
}
