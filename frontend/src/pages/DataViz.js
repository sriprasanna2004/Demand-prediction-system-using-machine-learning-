import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { vizApi } from '../api/client';
import styles from './DataViz.module.css';

// ── Palette ──────────────────────────────────────────────────────
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
const STATUS_COLOR = { critical: '#ef4444', low: '#f59e0b', ok: '#06b6d4', healthy: '#10b981' };

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: .3 } } };
const stagger = { show: { transition: { staggerChildren: .07 } } };

// ── Shared tooltip style ─────────────────────────────────────────
const tooltipStyle = {
  backgroundColor: 'rgba(8,12,20,0.97)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 12, fontSize: 12,
  color: '#f1f5f9', padding: '10px 14px',
};

// ── Stat pill ────────────────────────────────────────────────────
function StatPill({ label, value, color = '#6366f1', icon }) {
  return (
    <motion.div variants={fadeUp} className={styles.statPill}>
      <div className={styles.statPillIcon} style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        {icon}
      </div>
      <div>
        <div className={styles.statPillValue} style={{ color }}>{value}</div>
        <div className={styles.statPillLabel}>{label}</div>
      </div>
    </motion.div>
  );
}

// ── Section card ─────────────────────────────────────────────────
function VizCard({ title, badge, children, span = 1 }) {
  return (
    <motion.div variants={fadeUp} className={styles.vizCard} data-span={span}>
      <div className={styles.vizCardHeader}>
        <span className={styles.vizCardTitle}>{title}</span>
        {badge && <span className={styles.vizBadge}>{badge}</span>}
      </div>
      {children}
    </motion.div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────
function ChartSkeleton({ height = 220 }) {
  return <div style={{ height, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'shimmer 1.6s infinite' }} />;
}

// ── Custom pie label ─────────────────────────────────────────────
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function DataViz() {
  const { data: overview, isLoading: ovLoading }   = useQuery({ queryKey: ['viz-overview'],   queryFn: () => vizApi.overview().then(r => r.data),          staleTime: 60000 });
  const { data: timeseries, isLoading: tsLoading }  = useQuery({ queryKey: ['viz-timeseries'], queryFn: () => vizApi.timeseries(120).then(r => r.data),      staleTime: 60000 });
  const { data: byCategory, isLoading: catLoading } = useQuery({ queryKey: ['viz-category'],   queryFn: () => vizApi.byCategory().then(r => r.data),         staleTime: 60000 });
  const { data: topProds,   isLoading: topLoading } = useQuery({ queryKey: ['viz-top'],        queryFn: () => vizApi.topProducts(12).then(r => r.data),      staleTime: 60000 });
  const { data: monthly,    isLoading: moLoading }  = useQuery({ queryKey: ['viz-monthly'],    queryFn: () => vizApi.monthly().then(r => r.data),            staleTime: 60000 });
  const { data: priceDist,  isLoading: pdLoading }  = useQuery({ queryKey: ['viz-price'],      queryFn: () => vizApi.priceDistribution().then(r => r.data),  staleTime: 60000 });
  const { data: stockData,  isLoading: stLoading }  = useQuery({ queryKey: ['viz-stock'],      queryFn: () => vizApi.stockHealth().then(r => r.data),        staleTime: 60000 });

  const noData = !ovLoading && !overview?.totalQty;

  return (
    <div className={styles.page}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Dataset Visualizations</h1>
        <p className={styles.subtitle}>Full analysis of your uploaded sales data — demand patterns, category breakdown, stock health & more</p>
      </motion.div>

      {noData && (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.emptyIcon}>📊</div>
          <h2>No data yet</h2>
          <p>Upload a CSV in the <strong>Datasets</strong> page, map your columns, then come back here to see full visualizations.</p>
        </motion.div>
      )}

      {!noData && (
        <>
          {/* Overview pills */}
          <motion.div className={styles.pillRow} variants={stagger} initial="hidden" animate="show">
            <StatPill icon="📦" label="Total Units Sold"    color="#6366f1" value={overview?.totalQty?.toLocaleString()        ?? '—'} />
            <StatPill icon="💰" label="Total Revenue"       color="#10b981" value={overview ? `$${(overview.totalRevenue/1000).toFixed(1)}k` : '—'} />
            <StatPill icon="🧾" label="Sale Records"        color="#f59e0b" value={overview?.totalSaleRecords?.toLocaleString() ?? '—'} />
            <StatPill icon="🏷️" label="Products"            color="#8b5cf6" value={overview?.totalProducts?.toLocaleString()   ?? '—'} />
            <StatPill icon="📂" label="Categories"          color="#06b6d4" value={overview?.categoryBreakdown?.length         ?? '—'} />
            <StatPill icon="💲" label="Avg Product Price"   color="#ec4899" value={overview ? `$${overview.priceRange.avgPrice.toFixed(0)}` : '—'} />
          </motion.div>

          {/* Charts grid */}
          <motion.div className={styles.grid} variants={stagger} initial="hidden" animate="show">

            {/* 1. Daily sales area chart — full width */}
            <VizCard title="Daily Sales Volume — Full History" badge={`${timeseries?.length || 0} days`} span={2}>
              {tsLoading ? <ChartSkeleton height={240} /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={timeseries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qtyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}
                      interval={Math.floor((timeseries?.length || 1) / 8)} />
                    <YAxis yAxisId="qty" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="rev" orientation="right" tick={{ fill: '#10b981', fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => n === 'Revenue' ? [`$${v.toFixed(0)}`, n] : [v, n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                    <Area yAxisId="qty" type="monotone" dataKey="qty"     name="Units Sold" stroke="#6366f1" fill="url(#qtyGrad)" strokeWidth={2} dot={false} />
                    <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue"    stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 2. Category pie */}
            <VizCard title="Sales by Category" badge="Qty share">
              {catLoading ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="totalQty" nameKey="_id"
                      cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                      labelLine={false} label={renderPieLabel}>
                      {byCategory?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v.toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 3. Category revenue bar */}
            <VizCard title="Revenue by Category" badge="All time">
              {catLoading ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byCategory} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toFixed(0)}`, 'Revenue']} />
                    <Bar dataKey="totalRevenue" name="Revenue" radius={[6,6,0,0]}>
                      {byCategory?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 4. Top products horizontal bar — full width */}
            <VizCard title="Top Products by Units Sold" badge={`Top ${topProds?.length || 0}`} span={2}>
              {topLoading ? <ChartSkeleton height={280} /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topProds} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} width={130} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="totalQty" name="Units Sold" radius={[0,6,6,0]}>
                      {topProds?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 5. Monthly trend line */}
            <VizCard title="Monthly Demand Trend" badge={`${monthly?.length || 0} months`}>
              {moLoading ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthly} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="qty" name="Units" stroke="#8b5cf6" strokeWidth={2.5}
                      dot={{ fill: '#8b5cf6', r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 6. Price distribution */}
            <VizCard title="Product Price Distribution" badge="Buckets">
              {pdLoading ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priceDist?.map(d => ({ ...d, range: `$${d._id}` }))}
                    margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Products" fill="#06b6d4" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 7. Category radar */}
            <VizCard title="Category Performance Radar" badge="Multi-metric">
              {catLoading ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={byCategory?.map(c => ({
                    category: c._id,
                    qty:     Math.round(c.totalQty / Math.max(...(byCategory?.map(x => x.totalQty) || [1])) * 100),
                    revenue: Math.round(c.totalRevenue / Math.max(...(byCategory?.map(x => x.totalRevenue) || [1])) * 100),
                    products: Math.round(c.productCount / Math.max(...(byCategory?.map(x => x.productCount) || [1])) * 100),
                  }))}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                    <Radar name="Units"    dataKey="qty"      stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                    <Radar name="Revenue"  dataKey="revenue"  stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                    <Radar name="Products" dataKey="products" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 8. Stock health table — full width */}
            <VizCard title="Stock Health — Days of Supply" badge="All products" span={2}>
              {stLoading ? <ChartSkeleton height={200} /> : (
                <div className={styles.stockTable}>
                  <div className={styles.stockHeader}>
                    <span>Product</span><span>Category</span>
                    <span>Stock</span><span>Total Sold</span>
                    <span>Days of Supply</span><span>Status</span>
                  </div>
                  <div className={styles.stockBody}>
                    {stockData?.slice(0, 15).map((p, i) => (
                      <motion.div key={i} className={styles.stockRow}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}>
                        <span className={styles.stockName}>{p.name}</span>
                        <span className={styles.stockCat}>{p.category}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.stock}</span>
                        <span style={{ color: 'var(--text2)' }}>{p.totalSold.toLocaleString()}</span>
                        <div className={styles.dosBar}>
                          <div className={styles.dosFill} style={{
                            width: `${Math.min(100, (p.daysOfSupply / 90) * 100)}%`,
                            background: STATUS_COLOR[p.status]
                          }} />
                          <span className={styles.dosLabel} style={{ color: STATUS_COLOR[p.status] }}>
                            {p.daysOfSupply >= 365 ? '365+' : p.daysOfSupply}d
                          </span>
                        </div>
                        <span className={styles.statusBadge} data-status={p.status}>
                          {p.status}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </VizCard>

          </motion.div>
        </>
      )}
    </div>
  );
}
