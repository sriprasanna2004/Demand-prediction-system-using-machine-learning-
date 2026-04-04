import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { poApi, suppliersApi, productsApi } from '../api/client';

const card = {
  background: 'linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 22,
  position: 'relative', overflow: 'hidden',
};
const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 10, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};
const btn = (color = '#c2410c') => ({
  padding: '9px 18px', borderRadius: 11, border: 'none',
  background: `linear-gradient(135deg,${color},${color}cc)`,
  color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
  boxShadow: `0 4px 14px ${color}40`, transition: 'all .2s',
});

const STATUS_COLORS = {
  draft:     { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
  sent:      { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  confirmed: { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  delivered: { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.3)' },
  cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.3)' },
};

function exportPO(po) {
  const lines = [
    `PURCHASE ORDER — ${po.poNumber}`,
    `Date: ${new Date(po.createdAt).toLocaleDateString()}`,
    `Supplier: ${po.supplierName || '—'}`,
    `Status: ${po.status.toUpperCase()}`,
    `Expected Delivery: ${po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : '—'}`,
    '',
    'ITEMS:',
    ...po.items.map(i => `  ${i.productName} — Qty: ${i.quantity} × $${i.unitCost} = $${i.totalCost}`),
    '',
    `TOTAL: $${po.totalAmount?.toFixed(2)}`,
    po.notes ? `\nNotes: ${po.notes}` : '',
  ].join('\n');
  const blob = new Blob([lines], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${po.poNumber}.txt`; a.click();
  URL.revokeObjectURL(url);
  toast.success(`${po.poNumber} exported`);
}

export default function PurchaseOrders() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState([{ productId: '', productName: '', quantity: 1, unitCost: 0, totalCost: 0 }]);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: pos, isLoading } = useQuery({ queryKey: ['pos'], queryFn: () => poApi.list().then(r => r.data), staleTime: 0 });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list().then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.getAll().then(r => r.data) });

  const createMutation = useMutation({
    mutationFn: (d) => poApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); setShowForm(false); toast.success('Purchase order created'); },
    onError: e => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => poApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('Status updated'); },
    onError: e => toast.error(e.message),
  });

  const delMutation = useMutation({
    mutationFn: (id) => poApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('PO deleted'); },
  });

  const updateItem = (i, field, val) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: val };
    if (field === 'productId') {
      const p = products?.find(p => p._id === val);
      if (p) { updated[i].productName = p.name; updated[i].unitCost = p.price * 0.6; }
    }
    if (field === 'quantity' || field === 'unitCost') {
      updated[i].totalCost = +(updated[i].quantity * updated[i].unitCost).toFixed(2);
    }
    setItems(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const supplier = suppliers?.find(s => s._id === supplierId);
    createMutation.mutate({ supplierId, supplierName: supplier?.name || '', items, expectedDelivery, notes });
  };

  const filtered = filterStatus ? pos?.filter(p => p.status === filterStatus) : pos;
  const totalValue = pos?.reduce((s, p) => s + (p.totalAmount || 0), 0) || 0;
  const activePOs = pos?.filter(p => ['draft','sent','confirmed'].includes(p.status)).length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: '#f1f5f9' }}>Purchase Orders</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Create, track and manage supplier purchase orders</p>
      </motion.div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total POs', value: pos?.length || 0, color: '#c2410c' },
          { label: 'Active POs', value: activePOs, color: '#f59e0b' },
          { label: 'Delivered', value: pos?.filter(p=>p.status==='delivered').length||0, color: '#10b981' },
          { label: 'Total Value', value: `$${(totalValue/1000).toFixed(1)}k`, color: '#8b5cf6' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ ...inp, width: 160, colorScheme: 'dark' }}>
          <option value="">All statuses</option>
          {['draft','sent','confirmed','delivered','cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <button style={{ ...btn(), marginLeft: 'auto' }} onClick={() => setShowForm(true)}>+ New Purchase Order</button>
      </div>

      {/* PO list */}
      {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading...</div>
        : !filtered?.length ? (
          <div style={{ ...card, textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <p style={{ color: '#64748b', fontSize: 14 }}>No purchase orders yet. Create one to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((po, i) => {
              const sc = STATUS_COLORS[po.status] || STATUS_COLORS.draft;
              return (
                <motion.div key={po._id} style={card}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.3),transparent)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{po.poNumber}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{po.supplierName || 'No supplier'} · {po.items?.length} item{po.items?.length !== 1 ? 's' : ''}</div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                        {po.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#c2410c' }}>${po.totalAmount?.toFixed(0)}</span>
                      <select value={po.status} onChange={e => statusMutation.mutate({ id: po._id, status: e.target.value })}
                        style={{ ...inp, width: 130, padding: '6px 10px', colorScheme: 'dark' }}>
                        {['draft','sent','confirmed','delivered','cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                      </select>
                      <button onClick={() => exportPO(po)} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>⬇ PO</button>
                      <button onClick={() => delMutation.mutate(po._id)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                  {po.items?.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {po.items.map((item, j) => (
                        <span key={j} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: '#94a3b8' }}>
                          {item.productName} × {item.quantity}
                        </span>
                      ))}
                    </div>
                  )}
                  {po.expectedDelivery && (
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>
                      📅 Expected: {new Date(po.expectedDelivery).toLocaleDateString()}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

      {/* Create PO modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowForm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              style={{ ...card, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.4),transparent)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>New Purchase Order</h2>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Supplier</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ ...inp, colorScheme: 'dark' }}>
                      <option value="">Select supplier</option>
                      {suppliers?.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Expected Delivery</label>
                    <input type="date" style={{ ...inp, colorScheme: 'dark' }} value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Items *</label>
                    <button type="button" onClick={() => setItems([...items, { productId: '', productName: '', quantity: 1, unitCost: 0, totalCost: 0 }])}
                      style={{ padding: '3px 10px', borderRadius: 8, background: 'rgba(194,65,12,0.1)', border: '1px solid rgba(194,65,12,0.25)', color: '#fb923c', fontSize: 11, cursor: 'pointer' }}>
                      + Add Item
                    </button>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <select value={item.productId} onChange={e => updateItem(i, 'productId', e.target.value)} style={{ ...inp, colorScheme: 'dark' }}>
                        <option value="">Select product</option>
                        {products?.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                      <input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)} style={inp} />
                      <input type="number" min="0" step="0.01" placeholder="Unit cost" value={item.unitCost} onChange={e => updateItem(i, 'unitCost', +e.target.value)} style={inp} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', textAlign: 'right' }}>${item.totalCost.toFixed(2)}</div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}
                          style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>✕</button>
                      )}
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#c2410c', marginTop: 6 }}>
                    Total: ${items.reduce((s, i) => s + i.totalCost, 0).toFixed(2)}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notes</label>
                  <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" style={btn()} disabled={createMutation.isPending || !items.some(i => i.productId)}>
                    {createMutation.isPending ? 'Creating...' : 'Create Purchase Order'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} style={{ ...btn(), background: 'rgba(255,255,255,0.06)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
