import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { insightsApi, externalApi, vizApi } from '../api/client';
import { useSocket } from '../context/SocketContext';
import Skeleton from '../components/Skeleton';
import styles from './Dashboard.module.css';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

const stagger = { show: { transition: { staggerChildren: 0.1 } } };
const fadeUp  = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: .3 } } };

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
const TT = {
  backgroundColor: 'rgba(8,12,20,0.97)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 12, fontSize: 12, color: '#f1f5f9', padding: '10px 14px'
};

const KPI_CONFIG = [
  { key: 'sales',   label: 'Units Sold',    icon: 'QTY', color: '#6366f1' },
  { key: 'revenue', label: 'Revenue',       icon: 'REV', color: '#10b981' },
  { key: 'alerts',  label: 'Stock Alerts',  icon: 'ALT', color: '#f59e0b' },
  { key: 'trend',   label: 'Demand Trend',  icon: 'TRD', color: '#8b5cf6' },
];

function KpiCard({ label, value, icon, color, trend, meta, loading }) {
  const trendClass = trend > 0 ? styles.kpiTrendUp : trend < 0 ? styles.kpiTrendDown : styles.kpiTrendFlat;
  const trendIcon  = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return (
    <motion.div className={styles.kpiCard} variants={fadeUp} style={{ '--kpi-color': color }}>
      <div className={styles.kpiGlow} style={{ background: color }} />
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={styles.kpiIcon} style={{ background: `${color}18`, border: `1px solid ${color}30` }}>{icon}</div>
      </div>
      {loading
        ? <div style={{ height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
        : <div className={styles.kpiValue} style={{ color }}>{value ?? '—'}</div>
      }
      <div className={styles.kpiSub}>
        {trend !== undefined && (
          <span className={`${styles.kpiTrend} ${trendClass}`}>{trendIcon} {Math.abs(trend)}%</span>
        )}
        {meta && <span className={styles.kpiMeta}>{meta}</span>}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { connected, dashboardUpdate, lastSale } = useSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [liveSales, setLiveSales] = useState([]);

  // ── Detect uploaded dataset ──────────────────────────────────
  const { data: dsList } = useQuery({
    queryKey: ['viz-datasets-list'],
    queryFn: () => vizApi.datasetsList().then(r => r.data),
    staleTime: 0,
  });
  const activeDataset = dsList?.[0]; // most recent mapped dataset
  const dsId = activeDataset?.dataset_id;
  const hasDataset = !!dsId;

  // ── Dataset-based data (when CSV uploaded) ───────────────────
  const { data: dsOverview, isLoading: dsOvLoading } = useQuery({
    queryKey: ['viz-overview', dsId],
    queryFn: () => vizApi.overview(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsTimeseries, isLoading: dsTsLoading } = useQuery({
    queryKey: ['viz-ts', dsId],
    queryFn: () => vizApi.timeseries(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsTopProducts, isLoading: dsTopLoading } = useQuery({
    queryKey: ['viz-top', dsId],
    queryFn: () => vizApi.topProducts(dsId, 8).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsByCategory } = useQuery({
    queryKey: ['viz-cat', dsId],
    queryFn: () => vizApi.byCategory(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });

  // ── Simulated/live data (fallback when no dataset) ───────────
  const { data: insights, isLoading: insLoading } = useQuery({
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

  // ── Source switcher: dataset overrides simulated data ────────
  const isDatasetMode = hasDataset && dsOverview?.totalRows > 0;

  const kpiLoading = isDatasetMode ? dsOvLoading : insLoading;
  const lowStock   = dashboardUpdate?.lowStockAlerts || insights?.lowStockAlerts || [];
  const bm         = insights?.businessMetrics || {};
  const demandPct  = insights?.demandChangePct || 0;

  // KPIs: dataset mode uses viz data, live mode uses insights
  const kpis = isDatasetMode ? [
    { key: 'sales',   value: dsOverview?.totalQty?.toLocaleString(),                                    meta: `${activeDataset?.filename}` },
    { key: 'revenue', value: `$${((dsOverview?.totalRevenue || 0) / 1000).toFixed(1)}k`,               meta: 'from dataset' },
    { key: 'alerts',  value: dsOverview?.categoryBreakdown?.length || 0,                               meta: 'categories' },
    { key: 'trend',   value: `${dsOverview?.totalProducts || 0} products`,                             meta: 'in dataset' },
  ] : [
    { key: 'sales',   value: insights?.totalSalesLast30Days ?? '—', trend: demandPct, meta: 'vs prev 30d' },
    { key: 'revenue', value: `$${((insights?.totalRevenueLast30Days || 0) / 1000).toFixed(1)}k`,       meta: '30-day total' },
    { key: 'alerts',  value: lowStock.length, trend: lowStock.length > 0 ? -1 : 0,                    meta: 'need reorder' },
    { key: 'trend',   value: `${demandPct > 0 ? '+' : ''}${demandPct}%`, trend: demandPct,            meta: 'demand change' },
  ];

  // Chart data: dataset mode uses uploaded CSV timeseries
  const chartTimeseries = isDatasetMode
    ? (dsTimeseries || []).map(d => ({ _id: d._id, totalQty: d.qty, totalRevenue: d.revenue }))
    : (timeseries || []);

  const chartTopProducts = isDatasetMode
    ? (dsTopProducts || []).map(p => ({ name: p.name, qty: p.totalQty }))
    : (insights?.topProducts || []).map(p => ({ name: p.name, qty: p.qty }));

  const chartTitle = isDatasetMode
    ? `Dataset: ${activeDataset?.filename} — ${(activeDataset?.processed_rows || 0).toLocaleString()} rows`
    : 'Sales & Revenue — Last 14 Days';

  return (
    <div className={styles.page}>

      {/* Source indicator banner */}
      {isDatasetMode && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderRadius: 12, marginBottom: 4,
            background: 'rgba(194,65,12,0.08)', border: '1px solid rgba(194,65,12,0.25)',
            fontSize: 12.5,
          }}>
          <span style={{ color: '#fb923c', fontWeight: 600 }}>
            📂 Showing data from: <strong>{activeDataset?.filename}</strong>
          </span>
          <button onClick={() => navigate('/data-viz')}
            style={{
              background: 'rgba(194,65,12,0.2)', border: '1px solid rgba(194,65,12,0.35)',
              color: '#fb923c', padding: '4px 12px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            View Full Analysis →
          </button>
        </motion.div>
      )}

      {/* KPI row */}
      <motion.div className={styles.kpiGrid} variants={stagger} initial="hidden" animate="show">
        {KPI_CONFIG.map((cfg, i) => (
          <KpiCard key={cfg.key} {...cfg} {...kpis[i]} loading={kpiLoading} />
        ))}
      </motion.div>

      {/* Charts */}
      <motion.div className={styles.chartsRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>

        {/* Main timeseries chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{chartTitle}</span>
            <span className={styles.cardBadge}>{isDatasetMode ? 'Dataset' : 'Live'}</span>
          </div>
          {(isDatasetMode ? dsTsLoading : tsLoading)
            ? <Skeleton variant="row" count={4} height={20} />
            : chartTimeseries.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
                  No time-series data available
                </div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartTimeseries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}
                      interval={Math.max(0, Math.floor((chartTimeseries.length || 1) / 7) - 1)} />
                    <YAxis yAxisId="q" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#10b981', fontSize: 10 }}
                      tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT}
                      formatter={(v, n) => n === 'Revenue' ? [`$${v.toLocaleString()}`, n] : [v.toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                    <Area yAxisId="q" type="monotone" dataKey="totalQty"     name="Units Sold" stroke="#6366f1" fill="url(#qG)" strokeWidth={2} dot={false} />
                    <Area yAxisId="r" type="monotone" dataKey="totalRevenue" name="Revenue"    stroke="#10b981" fill="url(#rG)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )
          }
        </div>

        {/* Top products chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              {isDatasetMode ? 'Top Products (Dataset)' : 'Top Products (7d)'}
            </span>
          </div>
          {(isDatasetMode ? dsTopLoading : insLoading)
            ? <Skeleton variant="row" count={3} height={16} />
            : chartTopProducts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>No product data</div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartTopProducts} layout="vertical"
                    margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false} width={120}
                      tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                    <Tooltip contentStyle={TT} formatter={v => [v.toLocaleString(), 'Units']} />
                    <Bar dataKey="qty" name="Units" radius={[0, 6, 6, 0]}>
                      {chartTopProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
          }
        </div>
      </motion.div>

      {/* Bottom row */}
      <motion.div className={styles.bottomRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>

        {/* Category breakdown (dataset) or Business metrics (live) */}
        <div className={styles.card} style={{ gridColumn: 'span 3' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              {isDatasetMode ? 'Category Breakdown — Dataset' : 'Business Metrics'}
            </span>
          </div>
          {isDatasetMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {(dsByCategory || []).map((cat, i) => (
                <div key={cat._id} style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: `${COLORS[i % COLORS.length]}10`,
                  border: `1px solid ${COLORS[i % COLORS.length]}30`,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: COLORS[i % COLORS.length] }}>
                    {cat.totalQty?.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>
                    {cat._id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    ${cat.totalRevenue?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          )}
        </div>

        {/* AI Insights */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>AI Insights</span>
            <span className={styles.cardBadge}>{isDatasetMode ? 'Dataset' : 'Live'}</span>
          </div>
          <div className={styles.insightList}>
            {(insights?.insights?.length ? insights.insights : [
              { type: 'neutral', icon: '·', title: 'System Ready', text: 'Upload a CSV dataset to see AI-generated insights for your data.' },
            ]).map((msg, i) => {
              const item = typeof msg === 'string' ? { type: 'neutral', icon: '·', title: '', text: msg } : msg;
              const dotColor = item.type === 'positive' ? 'var(--success)' : item.type === 'danger' ? 'var(--danger)' : item.type === 'warning' ? 'var(--warning)' : 'var(--accent)';
              return (
                <motion.div key={i} className={styles.insightItem}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: .35 + i * .08 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    {item.title && <div style={{ fontWeight: 700, fontSize: 12.5, color: dotColor, marginBottom: 2 }}>{item.title}</div>}
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{item.text}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        {/* Today's Action Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Today's Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              lowStock.length > 0 && { priority: 'high', text: `Reorder ${lowStock.length} low-stock products`, link: '/inventory' },
              demandPct > 10 && { priority: 'medium', text: `Demand up ${demandPct}% - review stock`, link: '/predictions' },
              demandPct < -10 && { priority: 'medium', text: `Demand down - consider promotions`, link: '/decisions' },
              { priority: 'low', text: 'Run batch predictions to refresh forecasts', link: '/predictions' },
            ].filter(Boolean).slice(0, 3).map((action, i) => (
              <a key={i} href={action.link} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  background: action.priority === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${action.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase',
                    background: action.priority === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                    color: action.priority === 'high' ? '#f87171' : '#a5b4fc',
                  }}>{action.priority}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{action.text}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>-&gt;</span>
                </div>
              </a>
            ))}
          </div>
        </div>


        {/* Live feed */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Live Sales Feed</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? 'var(--success)' : 'var(--muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--success)' : 'var(--muted)', animation: connected ? 'pulse-dot 2s infinite' : 'none' }} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className={styles.feedList}>
            {liveSales.length === 0
              ? <p className={styles.empty}>Waiting for sales events...</p>
              : liveSales.map((s, i) => (
                <div key={i} className={styles.feedItem}>
                  
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>{s.productId?.name || 'Product'}</div>
                    <div className={styles.feedTime}>{new Date(s.timestamp || s.createdAt).toLocaleTimeString()}</div>
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
            <div className={styles.cardHeader}><span className={styles.cardTitle}>External Signals</span></div>
            <div className={styles.signalGrid}>
              {[
                { label: 'Temperature', value: external?.weather?.temperature != null ? `${external.weather.temperature}°C` : '—' },
                { label: 'Weather',     value: external?.weather?.weatherCondition || '—' },
                { label: 'Market Trend',      value: external?.trend?.trendScore != null ? `${external.trend.trendScore.toFixed(0)}/100` : '—' },
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
                <span className={styles.cardTitle}>Low Stock</span>
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



, color: '#10b981' },
  { key: 'alerts',  label: 'Stock Alerts',  icon: 'ALT', color: '#f59e0b' },
  { key: 'trend',   label: 'Demand Trend',  icon: 'TRD', color: '#8b5cf6' },
];

function KpiCard({ label, value, icon, color, trend, meta, loading }) {
  const trendClass = trend > 0 ? styles.kpiTrendUp : trend < 0 ? styles.kpiTrendDown : styles.kpiTrendFlat;
  const trendIcon  = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return (
    <motion.div className={styles.kpiCard} variants={fadeUp} style={{ '--kpi-color': color }}>
      <div className={styles.kpiGlow} style={{ background: color }} />
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={styles.kpiIcon} style={{ background: `${color}18`, border: `1px solid ${color}30` }}>{icon}</div>
      </div>
      {loading
        ? <div style={{ height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
        : <div className={styles.kpiValue} style={{ color }}>{value ?? '—'}</div>
      }
      <div className={styles.kpiSub}>
        {trend !== undefined && (
          <span className={`${styles.kpiTrend} ${trendClass}`}>{trendIcon} {Math.abs(trend)}%</span>
        )}
        {meta && <span className={styles.kpiMeta}>{meta}</span>}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { connected, dashboardUpdate, lastSale } = useSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [liveSales, setLiveSales] = useState([]);

  // ── Detect uploaded dataset ──────────────────────────────────
  const { data: dsList } = useQuery({
    queryKey: ['viz-datasets-list'],
    queryFn: () => vizApi.datasetsList().then(r => r.data),
    staleTime: 0,
  });
  const activeDataset = dsList?.[0]; // most recent mapped dataset
  const dsId = activeDataset?.dataset_id;
  const hasDataset = !!dsId;

  // ── Dataset-based data (when CSV uploaded) ───────────────────
  const { data: dsOverview, isLoading: dsOvLoading } = useQuery({
    queryKey: ['viz-overview', dsId],
    queryFn: () => vizApi.overview(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsTimeseries, isLoading: dsTsLoading } = useQuery({
    queryKey: ['viz-ts', dsId],
    queryFn: () => vizApi.timeseries(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsTopProducts, isLoading: dsTopLoading } = useQuery({
    queryKey: ['viz-top', dsId],
    queryFn: () => vizApi.topProducts(dsId, 8).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });
  const { data: dsByCategory } = useQuery({
    queryKey: ['viz-cat', dsId],
    queryFn: () => vizApi.byCategory(dsId).then(r => r.data),
    enabled: hasDataset, staleTime: 0,
  });

  // ── Simulated/live data (fallback when no dataset) ───────────
  const { data: insights, isLoading: insLoading } = useQuery({
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

  // ── Source switcher: dataset overrides simulated data ────────
  const isDatasetMode = hasDataset && dsOverview?.totalRows > 0;

  const kpiLoading = isDatasetMode ? dsOvLoading : insLoading;
  const lowStock   = dashboardUpdate?.lowStockAlerts || insights?.lowStockAlerts || [];
  const bm         = insights?.businessMetrics || {};
  const demandPct  = insights?.demandChangePct || 0;

  // KPIs: dataset mode uses viz data, live mode uses insights
  const kpis = isDatasetMode ? [
    { key: 'sales',   value: dsOverview?.totalQty?.toLocaleString(),                                    meta: `${activeDataset?.filename}` },
    { key: 'revenue', value: `$${((dsOverview?.totalRevenue || 0) / 1000).toFixed(1)}k`,               meta: 'from dataset' },
    { key: 'alerts',  value: dsOverview?.categoryBreakdown?.length || 0,                               meta: 'categories' },
    { key: 'trend',   value: `${dsOverview?.totalProducts || 0} products`,                             meta: 'in dataset' },
  ] : [
    { key: 'sales',   value: insights?.totalSalesLast30Days ?? '—', trend: demandPct, meta: 'vs prev 30d' },
    { key: 'revenue', value: `$${((insights?.totalRevenueLast30Days || 0) / 1000).toFixed(1)}k`,       meta: '30-day total' },
    { key: 'alerts',  value: lowStock.length, trend: lowStock.length > 0 ? -1 : 0,                    meta: 'need reorder' },
    { key: 'trend',   value: `${demandPct > 0 ? '+' : ''}${demandPct}%`, trend: demandPct,            meta: 'demand change' },
  ];

  // Chart data: dataset mode uses uploaded CSV timeseries
  const chartTimeseries = isDatasetMode
    ? (dsTimeseries || []).map(d => ({ _id: d._id, totalQty: d.qty, totalRevenue: d.revenue }))
    : (timeseries || []);

  const chartTopProducts = isDatasetMode
    ? (dsTopProducts || []).map(p => ({ name: p.name, qty: p.totalQty }))
    : (insights?.topProducts || []).map(p => ({ name: p.name, qty: p.qty }));

  const chartTitle = isDatasetMode
    ? `Dataset: ${activeDataset?.filename} — ${(activeDataset?.processed_rows || 0).toLocaleString()} rows`
    : 'Sales & Revenue — Last 14 Days';

  return (
    <div className={styles.page}>

      {/* Source indicator banner */}
      {isDatasetMode && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderRadius: 12, marginBottom: 4,
            background: 'rgba(194,65,12,0.08)', border: '1px solid rgba(194,65,12,0.25)',
            fontSize: 12.5,
          }}>
          <span style={{ color: '#fb923c', fontWeight: 600 }}>
            📂 Showing data from: <strong>{activeDataset?.filename}</strong>
          </span>
          <button onClick={() => navigate('/data-viz')}
            style={{
              background: 'rgba(194,65,12,0.2)', border: '1px solid rgba(194,65,12,0.35)',
              color: '#fb923c', padding: '4px 12px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            View Full Analysis →
          </button>
        </motion.div>
      )}

      {/* KPI row */}
      <motion.div className={styles.kpiGrid} variants={stagger} initial="hidden" animate="show">
        {KPI_CONFIG.map((cfg, i) => (
          <KpiCard key={cfg.key} {...cfg} {...kpis[i]} loading={kpiLoading} />
        ))}
      </motion.div>

      {/* Charts */}
      <motion.div className={styles.chartsRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>

        {/* Main timeseries chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{chartTitle}</span>
            <span className={styles.cardBadge}>{isDatasetMode ? 'Dataset' : 'Live'}</span>
          </div>
          {(isDatasetMode ? dsTsLoading : tsLoading)
            ? <Skeleton variant="row" count={4} height={20} />
            : chartTimeseries.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
                  No time-series data available
                </div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartTimeseries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}
                      interval={Math.max(0, Math.floor((chartTimeseries.length || 1) / 7) - 1)} />
                    <YAxis yAxisId="q" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#10b981', fontSize: 10 }}
                      tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT}
                      formatter={(v, n) => n === 'Revenue' ? [`$${v.toLocaleString()}`, n] : [v.toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                    <Area yAxisId="q" type="monotone" dataKey="totalQty"     name="Units Sold" stroke="#6366f1" fill="url(#qG)" strokeWidth={2} dot={false} />
                    <Area yAxisId="r" type="monotone" dataKey="totalRevenue" name="Revenue"    stroke="#10b981" fill="url(#rG)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )
          }
        </div>

        {/* Top products chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              {isDatasetMode ? 'Top Products (Dataset)' : 'Top Products (7d)'}
            </span>
          </div>
          {(isDatasetMode ? dsTopLoading : insLoading)
            ? <Skeleton variant="row" count={3} height={16} />
            : chartTopProducts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>No product data</div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartTopProducts} layout="vertical"
                    margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false} width={120}
                      tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                    <Tooltip contentStyle={TT} formatter={v => [v.toLocaleString(), 'Units']} />
                    <Bar dataKey="qty" name="Units" radius={[0, 6, 6, 0]}>
                      {chartTopProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
          }
        </div>
      </motion.div>

      {/* Bottom row */}
      <motion.div className={styles.bottomRow} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>

        {/* Category breakdown (dataset) or Business metrics (live) */}
        <div className={styles.card} style={{ gridColumn: 'span 3' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              {isDatasetMode ? 'Category Breakdown — Dataset' : 'Business Metrics'}
            </span>
          </div>
          {isDatasetMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {(dsByCategory || []).map((cat, i) => (
                <div key={cat._id} style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: `${COLORS[i % COLORS.length]}10`,
                  border: `1px solid ${COLORS[i % COLORS.length]}30`,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: COLORS[i % COLORS.length] }}>
                    {cat.totalQty?.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>
                    {cat._id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    ${cat.totalRevenue?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          )}
        </div>

        {/* AI Insights */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>AI Insights</span>
            <span className={styles.cardBadge}>{isDatasetMode ? 'Dataset' : 'Live'}</span>
          </div>
          <div className={styles.insightList}>
            {(insights?.insights?.length ? insights.insights : [
              { type: 'neutral', icon: '·', title: 'System Ready', text: 'Upload a CSV dataset to see AI-generated insights for your data.' },
            ]).map((msg, i) => {
              const item = typeof msg === 'string' ? { type: 'neutral', icon: '·', title: '', text: msg } : msg;
              const dotColor = item.type === 'positive' ? 'var(--success)' : item.type === 'danger' ? 'var(--danger)' : item.type === 'warning' ? 'var(--warning)' : 'var(--accent)';
              return (
                <motion.div key={i} className={styles.insightItem}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: .35 + i * .08 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    {item.title && <div style={{ fontWeight: 700, fontSize: 12.5, color: dotColor, marginBottom: 2 }}>{item.title}</div>}
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{item.text}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        {/* Today's Action Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Today's Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              lowStock.length > 0 && { priority: 'high', text: `Reorder ${lowStock.length} low-stock products`, link: '/inventory' },
              demandPct > 10 && { priority: 'medium', text: `Demand up ${demandPct}% - review stock`, link: '/predictions' },
              demandPct < -10 && { priority: 'medium', text: `Demand down - consider promotions`, link: '/decisions' },
              { priority: 'low', text: 'Run batch predictions to refresh forecasts', link: '/predictions' },
            ].filter(Boolean).slice(0, 3).map((action, i) => (
              <a key={i} href={action.link} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  background: action.priority === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${action.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase',
                    background: action.priority === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                    color: action.priority === 'high' ? '#f87171' : '#a5b4fc',
                  }}>{action.priority}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{action.text}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>-&gt;</span>
                </div>
              </a>
            ))}
          </div>
        </div>


        {/* Live feed */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Live Sales Feed</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? 'var(--success)' : 'var(--muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--success)' : 'var(--muted)', animation: connected ? 'pulse-dot 2s infinite' : 'none' }} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className={styles.feedList}>
            {liveSales.length === 0
              ? <p className={styles.empty}>Waiting for sales events...</p>
              : liveSales.map((s, i) => (
                <div key={i} className={styles.feedItem}>
                  
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>{s.productId?.name || 'Product'}</div>
                    <div className={styles.feedTime}>{new Date(s.timestamp || s.createdAt).toLocaleTimeString()}</div>
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
            <div className={styles.cardHeader}><span className={styles.cardTitle}>External Signals</span></div>
            <div className={styles.signalGrid}>
              {[
                { label: 'Temperature', value: external?.weather?.temperature != null ? `${external.weather.temperature}°C` : '—' },
                { label: 'Weather',     value: external?.weather?.weatherCondition || '—' },
                { label: 'Market Trend',      value: external?.trend?.trendScore != null ? `${external.trend.trendScore.toFixed(0)}/100` : '—' },
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
                <span className={styles.cardTitle}>Low Stock</span>
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







