import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { poApi, suppliersApi, productsApi, analyticsApi } from '../api/client';

const card = {
  background: 'linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 22,
  position: 'relative', overflow: 'hidden',
};
const accentLine = { position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.4),transparent)' };

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: .28 } } };
const stagger = { show: { transition: { staggerChildren: .07 } } };

function KpiBox({ label, value, sub, color = '#c2410c', icon }) {
  return (
    <motion.div variants={fadeUp} style={{ ...card, padding: '18px 20px' }}>
      <div style={accentLine} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
        <span style={{ fontSize: 18, width: 34, height: 34, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-.03em', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>{sub}</div>}
    </motion.div>
  );
}

function GaugeBar({ label, value, max = 100, color = '#c2410c', format = v => `${v}%` }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{format(value)}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .6, ease: 'easeOut' }}
          style={{ height: '100%', background: `linear-gradient(90deg,${color},${color}99)`, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export default function SupplyChain() {
  const { data: kpis, isLoading: kpiLoading } = useQuery({
    queryKey: ['scm-kpis'], queryFn: () => poApi.kpis().then(r => r.data), staleTime: 0, refetchInterval: 60000,
  });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list().then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.getAll().then(r => r.data) });
  const { data: batchPreds } = useQuery({ queryKey: ['batch-ml-predictions'], queryFn: () => analyticsApi.batchPredictions(50).then(r => r.data) });

  const criticalProducts = products?.filter(p => p.stock < 10) || [];
  const topRiskProducts = batchPreds?.filter(p => p.stockout_risk > 0.5).sort((a, b) => b.stockout_risk - a.stockout_risk).slice(0, 5) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: '#f1f5f9' }}>Supply Chain Overview</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Real-time KPIs — inventory health, supplier performance, stockout risk</p>
      </motion.div>

      {/* KPI grid */}
      <motion.div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} variants={stagger} initial="hidden" animate="show">
        <KpiBox label="Fill Rate" value={kpis ? `${kpis.fillRate}%` : '—'} sub="Products in stock" color="#10b981" icon="✅" />
        <KpiBox label="Stockout Rate" value={kpis ? `${kpis.stockoutRate}%` : '—'} sub={`${kpis?.stockoutProducts || 0} products at 0`} color="#ef4444" icon="⚠️" />
        <KpiBox label="Inventory Turnover" value={kpis?.inventoryTurnover ?? '—'} sub="Times/year" color="#c2410c" icon="🔄" />
        <KpiBox label="Days of Supply" value={kpis ? `${kpis.daysOfSupply}d` : '—'} sub="At current demand rate" color="#f59e0b" icon="📅" />
        <KpiBox label="Total Stock Units" value={kpis?.totalStockUnits?.toLocaleString() ?? '—'} sub="Across all products" color="#8b5cf6" icon="BOX" />
        <KpiBox label="Units Sold (30d)" value={kpis?.unitsSold30d?.toLocaleString() ?? '—'} sub="Recent demand" color="#06b6d4" icon="📈" />
        <KpiBox label="Active POs" value={kpis?.activePOs ?? '—'} sub="Draft + Sent + Confirmed" color="#c2410c" icon="📋" />
        <KpiBox label="Total PO Value" value={kpis ? `$${(kpis.totalPOValue / 1000).toFixed(1)}k` : '—'} sub="All purchase orders" color="#10b981" icon="$" />
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Inventory health gauges */}
        <motion.div style={card} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>
          <div style={accentLine} />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, background: 'linear-gradient(180deg,#c2410c,#9a3412)', borderRadius: 2 }} />
            Inventory Health
          </div>
          {kpiLoading ? <div style={{ color: '#64748b', fontSize: 13 }}>Loading...</div> : (
            <>
              <GaugeBar label="Fill Rate" value={kpis?.fillRate || 0} color="#10b981" />
              <GaugeBar label="Stock Coverage" value={Math.min(100, ((kpis?.daysOfSupply || 0) / 90) * 100)} color="#c2410c" format={v => `${kpis?.daysOfSupply || 0}d`} />
              <GaugeBar label="Inventory Utilization" value={Math.min(100, (kpis?.inventoryTurnover || 0) * 10)} color="#f59e0b" format={v => `${kpis?.inventoryTurnover || 0}x`} />
              <GaugeBar label="Products Healthy" value={kpis ? ((kpis.totalProducts - kpis.stockoutProducts - kpis.lowStockProducts) / Math.max(kpis.totalProducts, 1)) * 100 : 0} color="#8b5cf6" />
            </>
          )}
        </motion.div>

        {/* Supplier performance */}
        <motion.div style={card} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}>
          <div style={accentLine} />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, background: 'linear-gradient(180deg,#c2410c,#9a3412)', borderRadius: 2 }} />
            Supplier Performance
          </div>
          {!suppliers?.length ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: 13 }}>
              No suppliers added yet.<br />
              <a href="/suppliers" style={{ color: '#fb923c', fontWeight: 600 }}>Add suppliers →</a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {suppliers.slice(0, 5).map(s => (
                <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.location || 'Location not set'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.reliabilityPct >= 95 ? '#10b981' : s.reliabilityPct >= 85 ? '#f59e0b' : '#ef4444' }}>{s.reliabilityPct}%</div>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>{s.avgLeadDays}d lead</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Critical stock */}
        <motion.div style={card} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>
          <div style={accentLine} />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, background: 'linear-gradient(180deg,#ef4444,#dc2626)', borderRadius: 2 }} />
            Critical Stock ({criticalProducts.length})
          </div>
          {!criticalProducts.length ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#10b981', fontSize: 13 }}>✅ All products adequately stocked</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {criticalProducts.slice(0, 6).map(p => (
                <div key={p._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{p.category}</div>
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: p.stock === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)', color: p.stock === 0 ? '#f87171' : '#fbbf24', fontSize: 12, fontWeight: 700 }}>
                    {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Stockout risk */}
        <motion.div style={card} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }}>
          <div style={accentLine} />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, background: 'linear-gradient(180deg,#f59e0b,#d97706)', borderRadius: 2 }} />
            AI Stockout Risk
          </div>
          {!topRiskProducts.length ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: 13 }}>Run batch predictions to see stockout risk</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topRiskProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{p.product_name}</div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.stockout_risk * 100}%`, background: p.stockout_risk > 0.7 ? '#ef4444' : '#f59e0b', borderRadius: 3 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: p.stockout_risk > 0.7 ? '#f87171' : '#fbbf24', minWidth: 40, textAlign: 'right' }}>
                    {(p.stockout_risk * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}

