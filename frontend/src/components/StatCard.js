import { motion } from 'framer-motion';

export default function StatCard({ label, value, icon, trend, danger, unit }) {
  const trendColor = trend > 0 ? '#34d399' : trend < 0 ? '#f87171' : '#64748b';
  const trendIcon  = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 100%)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 18, padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 12,
        position: 'relative', overflow: 'hidden', cursor: 'default',
        transition: 'border-color .2s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          {label}
        </span>
        <span style={{
          width: 32, height: 32, borderRadius: 9,
          background: danger ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
          border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>{icon}</span>
      </div>
      <div style={{
        fontSize: 26, fontWeight: 800, letterSpacing: '-.04em',
        color: danger ? '#f87171' : 'var(--text)', lineHeight: 1,
      }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {trend !== undefined && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          background: `${trendColor}18`, color: trendColor, width: 'fit-content',
        }}>
          {trendIcon} {Math.abs(trend)}%
        </span>
      )}
    </motion.div>
  );
}
