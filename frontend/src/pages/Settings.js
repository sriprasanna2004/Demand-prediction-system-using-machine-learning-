import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';

const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: .28 } } };
const stagger = { show: { transition: { staggerChildren: .08 } } };

function SettingCard({ title, children }) {
  return (
    <motion.div variants={fadeUp} style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 24,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 14, background: 'linear-gradient(180deg, #6366f1, #8b5cf6)', borderRadius: 2 }} />
        {title}
      </div>
      {children}
    </motion.div>
  );
}

export default function Settings() {
  const [alertEmail, setAlertEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');

  const { data: alertStatus } = useQuery({
    queryKey: ['alert-status'],
    queryFn: () => api.get('/api/alerts/status').then(r => r),
    staleTime: 30000,
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/api/alerts/test', { email: testEmail }),
    onSuccess: r => toast.success(r.message || 'Test email sent'),
    onError: e => toast.error(e.message),
  });

  const lowStockMutation = useMutation({
    mutationFn: () => api.post('/api/alerts/low-stock'),
    onSuccess: r => toast.success(r.message || 'Low stock check complete'),
    onError: e => toast.error(e.message),
  });

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 12, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  const btnStyle = (color = '#6366f1') => ({
    padding: '10px 20px', borderRadius: 12, border: 'none',
    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
    boxShadow: `0 4px 16px ${color}40`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Configure alerts, account, and system preferences</p>
      </motion.div>

      <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} variants={stagger} initial="hidden" animate="show">

        {/* Account */}
        <SettingCard title="Account">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Authentication is disabled. All users have full access.</p>
        </SettingCard>

        {/* Email Alerts */}
        <SettingCard title="Email Alerts">
          {/* Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderRadius: 12, marginBottom: 18,
            background: alertStatus?.configured ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${alertStatus?.configured ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}>
            <span style={{ fontSize: 16 }}>{alertStatus?.configured ? '✅' : '⚠️'}</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: alertStatus?.configured ? '#6ee7b7' : '#fbbf24' }}>
                {alertStatus?.configured ? 'Email alerts configured' : 'Email alerts not configured'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {alertStatus?.configured
                  ? `Sending to: ${alertStatus.alert_email}`
                  : 'Set RESEND_API_KEY and ALERT_EMAIL in Railway environment variables'}
              </div>
            </div>
          </div>

          {/* Test email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Send Test Email
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="email" placeholder="your@email.com" value={testEmail}
                onChange={e => setTestEmail(e.target.value)} style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
              <button onClick={() => testMutation.mutate()} disabled={!testEmail || testMutation.isPending}
                style={{ ...btnStyle(), whiteSpace: 'nowrap', opacity: !testEmail ? 0.5 : 1 }}>
                {testMutation.isPending ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>

          {/* Manual triggers */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 10 }}>
              Manual Alert Triggers
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => lowStockMutation.mutate()} disabled={lowStockMutation.isPending}
                style={btnStyle('#ef4444')}>
                {lowStockMutation.isPending ? 'Checking...' : '⚠️ Check Low Stock Now'}
              </button>
            </div>
            {lowStockMutation.data && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--success)' }}>
                {lowStockMutation.data.message}
              </div>
            )}
          </div>

          {/* Setup instructions */}
          <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', marginBottom: 8 }}>Setup Instructions</div>
            <ol style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
              <li>Go to <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#a5b4fc' }}>resend.com</a> and create a free account</li>
              <li>Create an API key in the Resend dashboard</li>
              <li>In Railway backend service → Variables, add:<br />
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>RESEND_API_KEY=re_xxxx</code><br />
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>ALERT_EMAIL=you@company.com</code>
              </li>
              <li>Alerts fire automatically: low stock (8 AM daily), drift detection, retrain complete</li>
            </ol>
          </div>
        </SettingCard>

        {/* System info */}
        <SettingCard title="System">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Frontend', value: 'React 18 + Recharts' },
              { label: 'Backend',  value: 'Node.js + Express' },
              { label: 'Database', value: 'MongoDB Atlas' },
              { label: 'ML Service', value: 'FastAPI + XGBoost + LightGBM' },
              { label: 'Deployment', value: 'Railway + Vercel' },
              { label: 'Version', value: 'v4.0.0' },
            ].map(f => (
              <div key={f.label} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{f.value}</div>
              </div>
            ))}
          </div>
        </SettingCard>

      </motion.div>
    </div>
  );
}
