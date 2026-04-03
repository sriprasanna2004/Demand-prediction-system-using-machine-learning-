import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { productsApi, vizApi, insightsApi } from '../api/client';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getColor(value, max) {
  if (!value || max === 0) return 'rgba(255,255,255,0.04)';
  const intensity = value / max;
  if (intensity > 0.8) return 'rgba(99,102,241,0.9)';
  if (intensity > 0.6) return 'rgba(99,102,241,0.7)';
  if (intensity > 0.4) return 'rgba(99,102,241,0.5)';
  if (intensity > 0.2) return 'rgba(99,102,241,0.3)';
  return 'rgba(99,102,241,0.12)';
}

function buildCalendar(year, month, dailyMap) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, key, value: dailyMap[key] || 0 });
  }
  return cells;
}

export default function Calendar() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [source, setSource] = useState('live'); // 'live' | dataset_id
  const [tooltip, setTooltip] = useState(null);

  // Dataset list
  const { data: dsList } = useQuery({
    queryKey: ['viz-datasets-list'],
    queryFn: () => vizApi.datasetsList().then(r => r.data),
    staleTime: 30000,
  });

  // Live timeseries (365 days)
  const { data: liveTs } = useQuery({
    queryKey: ['timeseries-365'],
    queryFn: () => insightsApi.getTimeseries(365).then(r => r.data),
    enabled: source === 'live',
    staleTime: 60000,
  });

  // Dataset timeseries
  const { data: dsTs } = useQuery({
    queryKey: ['viz-ts-cal', source],
    queryFn: () => vizApi.timeseries(source).then(r => r.data),
    enabled: source !== 'live',
    staleTime: 60000,
  });

  const rawTs = source === 'live' ? liveTs : dsTs;

  // Build daily map
  const dailyMap = {};
  (rawTs || []).forEach(d => {
    const qty = d.totalQty ?? d.qty ?? 0;
    dailyMap[d._id] = qty;
  });

  const maxVal = Math.max(...Object.values(dailyMap), 1);
  const cells  = buildCalendar(year, month, dailyMap);

  // Monthly totals for mini sparkline
  const monthlyTotals = MONTHS.map((_, mi) => {
    const prefix = `${year}-${String(mi + 1).padStart(2, '0')}`;
    return Object.entries(dailyMap)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((s, [, v]) => s + v, 0);
  });
  const maxMonthly = Math.max(...monthlyTotals, 1);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const monthTotal = cells.filter(Boolean).reduce((s, c) => s + (c?.value || 0), 0);
  const activeDays = cells.filter(c => c?.value > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Demand Calendar</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Daily demand heatmap — spot seasonal patterns and peak days</p>
      </motion.div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <select value={source} onChange={e => setSource(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
          <option value="live">Live Sales Data</option>
          {dsList?.map(d => <option key={d.dataset_id} value={d.dataset_id}>{d.filename}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 120, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>›</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Month Total',  value: monthTotal.toLocaleString(), color: '#6366f1' },
          { label: 'Active Days',  value: `${activeDays} / ${cells.filter(Boolean).length}`, color: '#10b981' },
          { label: 'Daily Avg',    value: activeDays > 0 ? Math.round(monthTotal / activeDays).toLocaleString() : '—', color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-.03em' }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 24 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((cell, i) => (
            <div key={i}
              onMouseEnter={() => cell && setTooltip(cell)}
              onMouseLeave={() => setTooltip(null)}
              style={{
                aspectRatio: '1', borderRadius: 8,
                background: cell ? getColor(cell.value, maxVal) : 'transparent',
                border: cell ? '1px solid rgba(255,255,255,0.06)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: cell ? 'pointer' : 'default',
                transition: 'transform .15s',
                position: 'relative',
              }}
              onMouseOver={e => { if (cell) e.currentTarget.style.transform = 'scale(1.15)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {cell && (
                <span style={{ fontSize: 10, fontWeight: 600, color: cell.value > maxVal * 0.5 ? '#fff' : 'var(--muted)' }}>
                  {cell.day}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            fontSize: 13, color: 'var(--text)',
          }}>
            <strong>{tooltip.key}</strong> — {tooltip.value > 0 ? `${tooltip.value.toLocaleString()} units sold` : 'No sales recorded'}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>Less</span>
          {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
            <div key={v} style={{ width: 14, height: 14, borderRadius: 3, background: getColor(v * maxVal, maxVal) }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>More</span>
        </div>
      </div>

      {/* Monthly sparkline */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>Monthly Overview — {year}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
          {monthlyTotals.map((val, mi) => (
            <div key={mi} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%', borderRadius: '4px 4px 0 0',
                height: `${Math.max(4, (val / maxMonthly) * 52)}px`,
                background: mi === month ? '#6366f1' : 'rgba(99,102,241,0.3)',
                transition: 'height .3s ease',
              }} />
              <span style={{ fontSize: 9, color: mi === month ? '#a5b4fc' : 'var(--muted)', fontWeight: mi === month ? 700 : 400 }}>{MONTHS[mi]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
