import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Scatter
} from 'recharts';
import { vizApi } from '../api/client';
import styles from './DataViz.module.css';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#a78bfa'];
const STATUS_COLOR = { critical:'#ef4444', low:'#f59e0b', ok:'#06b6d4', healthy:'#10b981' };
const fadeUp  = { hidden:{ opacity:0, y:20 }, show:{ opacity:1, y:0, transition:{ duration:.28 } } };
const stagger = { show:{ transition:{ staggerChildren:.055 } } };
const TT = {
  backgroundColor:'rgba(8,12,20,0.97)',
  border:'1px solid rgba(99,102,241,0.25)',
  borderRadius:12, fontSize:12, color:'#f1f5f9', padding:'10px 14px'
};

function StatPill({ label, value, color='#6366f1', icon }) {
  return (
    <motion.div variants={fadeUp} className={styles.statPill}>
      <div className={styles.statPillIcon} style={{ background:`${color}18`, border:`1px solid ${color}30` }}>{icon}</div>
      <div>
        <div className={styles.statPillValue} style={{ color }}>{value ?? '—'}</div>
        <div className={styles.statPillLabel}>{label}</div>
      </div>
    </motion.div>
  );
}

function VizCard({ title, badge, children, span=1 }) {
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

function Skel({ h=220 }) {
  return <div style={{ height:h, borderRadius:12, background:'rgba(255,255,255,0.04)', animation:'shimmer 1.6s infinite' }} />;
}

const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * R);
  const y = cy + r * Math.sin(-midAngle * R);
  return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent*100).toFixed(0)}%`}</text>;
};

export default function DataViz() {
  const [selectedDs, setSelectedDs] = useState('');

  const { data: dsList, isLoading: dsListLoading } = useQuery({
    queryKey: ['viz-datasets-list'],
    queryFn: () => vizApi.datasetsList().then(r => r.data),
    staleTime: 0,
    onSuccess: (data) => { if (data?.length && !selectedDs) setSelectedDs(data[0].dataset_id); }
  });

  // Auto-select first dataset
  const ds = selectedDs || dsList?.[0]?.dataset_id;
  const currentDs = dsList?.find(d => d.dataset_id === ds);

  const enabled = !!ds;

  const { data: overview,  isLoading: ovL  } = useQuery({ queryKey:['viz-ov',  ds], queryFn:() => vizApi.overview(ds).then(r=>r.data),         enabled, staleTime:30000 });
  const { data: timeseries,isLoading: tsL  } = useQuery({ queryKey:['viz-ts',  ds], queryFn:() => vizApi.timeseries(ds).then(r=>r.data),        enabled, staleTime:30000 });
  const { data: byCategory,isLoading: catL } = useQuery({ queryKey:['viz-cat', ds], queryFn:() => vizApi.byCategory(ds).then(r=>r.data),        enabled, staleTime:30000 });
  const { data: topProds,  isLoading: topL } = useQuery({ queryKey:['viz-top', ds], queryFn:() => vizApi.topProducts(ds,12).then(r=>r.data),    enabled, staleTime:30000 });
  const { data: monthly,   isLoading: moL  } = useQuery({ queryKey:['viz-mo',  ds], queryFn:() => vizApi.monthly(ds).then(r=>r.data),           enabled, staleTime:30000 });
  const { data: byRegion,  isLoading: regL } = useQuery({ queryKey:['viz-reg', ds], queryFn:() => vizApi.byRegion(ds).then(r=>r.data),          enabled, staleTime:30000 });
  const { data: profit,    isLoading: prL  } = useQuery({ queryKey:['viz-pr',  ds], queryFn:() => vizApi.profitAnalysis(ds).then(r=>r.data),    enabled, staleTime:30000 });
  const { data: priceDist, isLoading: pdL  } = useQuery({ queryKey:['viz-pd',  ds], queryFn:() => vizApi.priceDistribution(ds).then(r=>r.data), enabled, staleTime:30000 });
  const { data: stockData, isLoading: stL  } = useQuery({ queryKey:['viz-st',  ds], queryFn:() => vizApi.stockHealth(ds).then(r=>r.data),       enabled, staleTime:30000 });

  const noDatasets = !dsListLoading && !dsList?.length;
  const noData     = enabled && !ovL && !overview?.totalRows;

  // Detect if dataset has region/profit columns
  const hasRegion = byRegion?.length > 0;
  const hasProfit = profit?.some(p => p.totalProfit !== 0);
  const hasStock  = stockData?.some(p => p.stock > 0);

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}>
        <h1 className={styles.title}>Data Visualizations</h1>
        <p className={styles.subtitle}>Visual analysis of your uploaded dataset — all charts built from your CSV data only</p>
      </motion.div>

      {/* Dataset selector */}
      <div className={styles.selectorRow}>
        <span className={styles.selectorLabel}>📂 Dataset</span>
        {dsListLoading ? (
          <div style={{ height:36, width:300, borderRadius:10, background:'rgba(255,255,255,0.05)', animation:'shimmer 1.5s infinite' }} />
        ) : noDatasets ? (
          <span style={{ color:'var(--muted)', fontSize:13 }}>No datasets uploaded yet</span>
        ) : (
          <select className={styles.dsSelect} value={ds || ''} onChange={e => setSelectedDs(e.target.value)}>
            {dsList.map(d => (
              <option key={d.dataset_id} value={d.dataset_id}>
                {d.filename} — {(d.processed_rows || d.row_count || 0).toLocaleString()} rows
              </option>
            ))}
          </select>
        )}
        {currentDs && (
          <div className={styles.dsInfo}>
            <span>Columns: {currentDs.columns?.join(', ')}</span>
          </div>
        )}
      </div>

      {/* No datasets */}
      {noDatasets && (
        <motion.div className={styles.emptyState} initial={{ opacity:0 }} animate={{ opacity:1 }}>
          <div className={styles.emptyIcon}>📊</div>
          <h2>No datasets uploaded</h2>
          <p>Go to <strong>Datasets</strong>, upload a CSV and map your columns. Your data will appear here instantly.</p>
        </motion.div>
      )}

      {/* Dataset selected but empty */}
      {!noDatasets && noData && (
        <motion.div className={styles.emptyState} initial={{ opacity:0 }} animate={{ opacity:1 }}>
          <div className={styles.emptyIcon}>⚠️</div>
          <h2>No rows found for this dataset</h2>
          <p>Try re-mapping the dataset in the <strong>Datasets</strong> page.</p>
        </motion.div>
      )}

      {!noDatasets && !noData && enabled && (
        <>
          {/* Stat pills */}
          <motion.div className={styles.pillRow} variants={stagger} initial="hidden" animate="show">
            <StatPill icon="📦" label="Total Quantity"   color="#6366f1" value={overview?.totalQty?.toLocaleString()} />
            <StatPill icon="💰" label="Total Sales"      color="#10b981" value={overview ? `$${overview.totalRevenue.toLocaleString()}` : '—'} />
            <StatPill icon="🧾" label="Total Rows"       color="#f59e0b" value={overview?.totalRows?.toLocaleString()} />
            <StatPill icon="🏷️" label="Unique Products"  color="#8b5cf6" value={overview?.totalProducts?.toLocaleString()} />
            <StatPill icon="📂" label="Categories"       color="#06b6d4" value={overview?.categoryBreakdown?.length} />
            {hasRegion && <StatPill icon="🌍" label="Regions" color="#ec4899" value={byRegion?.length} />}
          </motion.div>

          <motion.div className={styles.grid} variants={stagger} initial="hidden" animate="show">

            {/* 1. Daily / date-based area chart — full width */}
            <VizCard title="Sales Over Time" badge={`${timeseries?.length || 0} data points`} span={2}>
              {tsL ? <Skel h={240} /> : !timeseries?.length ? (
                <p className={styles.noChart}>No date data available in this dataset</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={timeseries} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                    <defs>
                      <linearGradient id="qG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="rG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false}
                      interval={Math.max(0, Math.floor((timeseries?.length||1)/8)-1)} />
                    <YAxis yAxisId="q" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill:'#10b981', fontSize:10 }} tickLine={false} axisLine={false}
                      tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={(v,n)=>n==='Revenue'?[`$${v.toLocaleString()}`,n]:[v.toLocaleString(),n]} />
                    <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                    <Area yAxisId="q" type="monotone" dataKey="qty"     name="Quantity" stroke="#6366f1" fill="url(#qG)" strokeWidth={2} dot={false} />
                    <Area yAxisId="r" type="monotone" dataKey="revenue" name="Revenue"  stroke="#10b981" fill="url(#rG)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 2. Category pie */}
            <VizCard title="Sales by Category" badge="Quantity share">
              {catL ? <Skel /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="totalQty" nameKey="_id"
                      cx="50%" cy="50%" outerRadius={85} innerRadius={38}
                      labelLine={false} label={renderPieLabel}>
                      {byCategory?.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={(v,n)=>[v.toLocaleString(),n]} />
                    <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 3. Category revenue bar */}
            <VizCard title="Revenue by Category">
              {catL ? <Skel /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byCategory} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="_id" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} />
                    <YAxis tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false}
                      tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={v=>[`$${v.toLocaleString()}`,'Revenue']} />
                    <Bar dataKey="totalRevenue" name="Revenue" radius={[6,6,0,0]}>
                      {byCategory?.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 4. Top products — full width */}
            <VizCard title="Top Products by Quantity Sold" badge={`Top ${topProds?.length||0}`} span={2}>
              {topL ? <Skel h={Math.max(200,(topProds?.length||5)*28)} /> : (
                <ResponsiveContainer width="100%" height={Math.max(200,(topProds?.length||5)*28)}>
                  <BarChart data={topProds} layout="vertical" margin={{ top:4, right:80, left:10, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill:'#94a3b8', fontSize:11 }} tickLine={false} width={140} />
                    <Tooltip contentStyle={TT} formatter={(v,n)=>[v.toLocaleString(),n]} />
                    <Bar dataKey="totalQty" name="Quantity" radius={[0,6,6,0]}>
                      {topProds?.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 5. Monthly trend */}
            <VizCard title="Monthly Trend" badge={`${monthly?.length||0} months`}>
              {moL ? <Skel /> : !monthly?.length ? (
                <p className={styles.noChart}>No monthly data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthly} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="_id" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} />
                    <YAxis tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} formatter={(v,n)=>[v.toLocaleString(),n]} />
                    <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                    <Line type="monotone" dataKey="qty"     name="Quantity" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill:'#8b5cf6', r:3 }} activeDot={{ r:5 }} />
                    <Line type="monotone" dataKey="revenue" name="Revenue"  stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 6. Region breakdown (if available) */}
            {hasRegion && (
              <VizCard title="Sales by Region" badge={`${byRegion?.length} regions`}>
                {regL ? <Skel /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byRegion} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="_id" tick={{ fill:'#64748b', fontSize:11 }} tickLine={false} />
                      <YAxis tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TT} formatter={(v,n)=>[v.toLocaleString(),n]} />
                      <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                      <Bar dataKey="totalRevenue" name="Revenue"  fill="#6366f1" radius={[6,6,0,0]} />
                      <Bar dataKey="totalProfit"  name="Profit"   fill="#10b981" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </VizCard>
            )}

            {/* 7. Profit analysis (if available) */}
            {hasProfit && (
              <VizCard title="Profit vs Sales by Product" badge="Top 12" span={hasRegion ? 1 : 2}>
                {prL ? <Skel h={hasRegion ? 220 : 260} /> : (
                  <ResponsiveContainer width="100%" height={hasRegion ? 220 : 260}>
                    <ComposedChart data={profit} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill:'#64748b', fontSize:9 }} tickLine={false} angle={-20} textAnchor="end" height={40} />
                      <YAxis tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TT} formatter={(v,n)=>[`$${v.toLocaleString()}`,n]} />
                      <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                      <Bar dataKey="totalSales"  name="Sales"  fill="#6366f1" radius={[4,4,0,0]} opacity={0.8} />
                      <Bar dataKey="totalProfit" name="Profit" fill="#10b981" radius={[4,4,0,0]} />
                      <Line type="monotone" dataKey="margin" name="Margin %" stroke="#f59e0b" strokeWidth={2} dot={{ r:3 }} yAxisId={0} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </VizCard>
            )}

            {/* 8. Price/Sales distribution */}
            <VizCard title="Sales Value Distribution" badge="Buckets">
              {pdL ? <Skel /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priceDist} margin={{ top:8, right:8, left:-10, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="_id" tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} />
                    <YAxis tick={{ fill:'#64748b', fontSize:10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} formatter={(v,n)=>[v.toLocaleString(),'Transactions']} />
                    <Bar dataKey="count" name="Transactions" radius={[6,6,0,0]}>
                      {priceDist?.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 9. Category radar */}
            <VizCard title="Category Performance Radar">
              {catL ? <Skel /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={byCategory?.map(c => {
                    const maxQ = Math.max(...(byCategory?.map(x=>x.totalQty)||[1]));
                    const maxR = Math.max(...(byCategory?.map(x=>x.totalRevenue)||[1]));
                    const maxP = Math.max(...(byCategory?.map(x=>x.productCount)||[1]));
                    return {
                      category: c._id,
                      qty:      Math.round(c.totalQty      / maxQ * 100),
                      revenue:  Math.round(c.totalRevenue  / maxR * 100),
                      products: Math.round(c.productCount  / maxP * 100),
                    };
                  })}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="category" tick={{ fill:'#94a3b8', fontSize:10 }} />
                    <PolarRadiusAxis tick={{ fill:'#64748b', fontSize:9 }} domain={[0,100]} />
                    <Radar name="Quantity" dataKey="qty"      stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                    <Radar name="Revenue"  dataKey="revenue"  stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                    <Radar name="Products" dataKey="products" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                    <Legend wrapperStyle={{ fontSize:11, color:'#94a3b8' }} />
                    <Tooltip contentStyle={TT} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </VizCard>

            {/* 10. Stock health (if stock column exists) */}
            {hasStock && (
              <VizCard title="Stock Health — Days of Supply" badge={`${stockData?.length} products`} span={2}>
                {stL ? <Skel h={200} /> : (
                  <div className={styles.stockTable}>
                    <div className={styles.stockHeader}>
                      <span>Product</span><span>Category</span>
                      <span>Stock</span><span>Total Sold</span>
                      <span>Days of Supply</span><span>Status</span>
                    </div>
                    <div className={styles.stockBody}>
                      {stockData?.map((p,i)=>(
                        <motion.div key={i} className={styles.stockRow}
                          initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                          transition={{ delay:i*0.025 }}>
                          <span className={styles.stockName}>{p.name}</span>
                          <span className={styles.stockCat}>{p.category}</span>
                          <span style={{ color:'var(--text)', fontWeight:600 }}>{p.stock}</span>
                          <span style={{ color:'var(--text2)' }}>{p.totalSold.toLocaleString()}</span>
                          <div className={styles.dosBar}>
                            <div className={styles.dosFill} style={{
                              width:`${Math.min(100,(p.daysOfSupply/90)*100)}%`,
                              background:STATUS_COLOR[p.status]
                            }}/>
                            <span className={styles.dosLabel} style={{ color:STATUS_COLOR[p.status] }}>
                              {p.daysOfSupply>=365?'365+':p.daysOfSupply}d
                            </span>
                          </div>
                          <span className={styles.statusBadge} data-status={p.status}>{p.status}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </VizCard>
            )}

          </motion.div>
        </>
      )}
    </div>
  );
}

