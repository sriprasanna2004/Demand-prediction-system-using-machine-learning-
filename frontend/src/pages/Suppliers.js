import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { suppliersApi } from '../api/client';

const EMPTY = { name: '', contactEmail: '', contactPhone: '', location: '', categories: '', avgLeadDays: 7, reliabilityPct: 95, costPerUnit: 0, notes: '' };

const card = {
  background: 'linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 22,
  position: 'relative', overflow: 'hidden',
};
const cardTop = { content: '', position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.4),transparent)' };

const inp = {
  width: '100%', padding: '10px 14px', borderRadius: 12, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

const btn = (color = '#c2410c') => ({
  padding: '10px 20px', borderRadius: 12, border: 'none',
  background: `linear-gradient(135deg,${color},${color}cc)`,
  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  boxShadow: `0 4px 16px ${color}40`, transition: 'all .2s',
});

const RELIABILITY_COLOR = (r) => r >= 95 ? '#10b981' : r >= 85 ? '#f59e0b' : '#ef4444';

export default function Suppliers() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.list().then(r => r.data),
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editId ? suppliersApi.update(editId, d) : suppliersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setForm(EMPTY); setEditId(null); setShowForm(false);
      toast.success(editId ? 'Supplier updated' : 'Supplier added');
    },
    onError: e => toast.error(e.message),
  });

  const delMutation = useMutation({
    mutationFn: (id) => suppliersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setConfirmDel(null); toast.success('Supplier removed'); },
    onError: e => toast.error(e.message),
  });

  const handleEdit = (s) => {
    setForm({ ...s, categories: s.categories?.join(', ') || '' });
    setEditId(s._id); setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form, categories: form.categories.split(',').map(c => c.trim()).filter(Boolean), avgLeadDays: +form.avgLeadDays, reliabilityPct: +form.reliabilityPct, costPerUnit: +form.costPerUnit };
    saveMutation.mutate(payload);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: '#f1f5f9' }}>Supplier Management</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Track suppliers, lead times, reliability and costs</p>
      </motion.div>

      {/* Stats row */}
      {suppliers?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Total Suppliers', value: suppliers.length, color: '#c2410c' },
            { label: 'Avg Lead Time', value: `${Math.round(suppliers.reduce((s,x)=>s+x.avgLeadDays,0)/suppliers.length)}d`, color: '#f59e0b' },
            { label: 'Avg Reliability', value: `${Math.round(suppliers.reduce((s,x)=>s+x.reliabilityPct,0)/suppliers.length)}%`, color: '#10b981' },
            { label: 'Categories Covered', value: [...new Set(suppliers.flatMap(s=>s.categories||[]))].length, color: '#8b5cf6' },
          ].map(m => (
            <div key={m.label} style={{ ...card, padding: '14px 18px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}>
          + Add Supplier
        </button>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowForm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              style={{ ...card, width: '100%', maxWidth: 520, boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.4),transparent)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>
                {editId ? 'Edit Supplier' : 'Add New Supplier'}
              </h2>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { key: 'name', label: 'Supplier Name *', required: true },
                    { key: 'location', label: 'Location' },
                    { key: 'contactEmail', label: 'Email', type: 'email' },
                    { key: 'contactPhone', label: 'Phone' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.label}</label>
                      <input style={inp} type={f.type || 'text'} required={f.required}
                        value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        onFocus={e => e.target.style.borderColor = 'rgba(194,65,12,0.5)'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Categories (comma-separated)</label>
                  <input style={inp} placeholder="Electronics, Clothing, Food" value={form.categories || ''}
                    onChange={e => setForm({ ...form, categories: e.target.value })}
                    onFocus={e => e.target.style.borderColor = 'rgba(194,65,12,0.5)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { key: 'avgLeadDays', label: 'Avg Lead Days', type: 'number' },
                    { key: 'reliabilityPct', label: 'Reliability %', type: 'number' },
                    { key: 'costPerUnit', label: 'Cost/Unit ($)', type: 'number' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.label}</label>
                      <input style={inp} type={f.type} min="0" value={form[f.key] || ''}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        onFocus={e => e.target.style.borderColor = 'rgba(194,65,12,0.5)'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notes</label>
                  <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} value={form.notes || ''}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    onFocus={e => e.target.style.borderColor = 'rgba(194,65,12,0.5)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="submit" style={btn()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving...' : editId ? 'Update Supplier' : 'Add Supplier'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} style={{ ...btn('#374151'), background: 'rgba(255,255,255,0.06)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supplier cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading suppliers...</div>
      ) : !suppliers?.length ? (
        <div style={{ ...card, textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏭</div>
          <p style={{ color: '#64748b', fontSize: 14 }}>No suppliers yet. Add your first supplier to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
          {suppliers.map((s, i) => (
            <motion.div key={s._id} style={card}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(194,65,12,0.3),transparent)' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{s.name}</div>
                  {s.location && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📍 {s.location}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleEdit(s)} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => setConfirmDel(s)} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Del</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Lead Time', value: `${s.avgLeadDays}d`, color: '#f59e0b' },
                  { label: 'Reliability', value: `${s.reliabilityPct}%`, color: RELIABILITY_COLOR(s.reliabilityPct) },
                  { label: 'Cost/Unit', value: s.costPerUnit > 0 ? `$${s.costPerUnit}` : '—', color: '#c2410c' },
                ].map(m => (
                  <div key={m.label} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {s.categories?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.categories.map(c => (
                    <span key={c} style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(194,65,12,0.1)', border: '1px solid rgba(194,65,12,0.2)', color: '#fb923c', fontSize: 11, fontWeight: 600 }}>{c}</span>
                  ))}
                </div>
              )}
              {s.contactEmail && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 10 }}>✉️ {s.contactEmail}</div>}
            </motion.div>
          ))}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...card, maxWidth: 380, width: '100%' }}>
            <h3 style={{ color: '#f87171', marginBottom: 10 }}>Remove Supplier</h3>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>Remove <strong style={{ color: '#f1f5f9' }}>{confirmDel.name}</strong>? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn('#ef4444')} onClick={() => delMutation.mutate(confirmDel._id)} disabled={delMutation.isPending}>
                {delMutation.isPending ? 'Removing...' : 'Yes, Remove'}
              </button>
              <button style={{ ...btn(), background: 'rgba(255,255,255,0.06)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => setConfirmDel(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
