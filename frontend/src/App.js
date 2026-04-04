import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Predictions from './pages/Predictions';
import Inventory from './pages/Inventory';
import Forecast from './pages/Forecast';
import Decisions from './pages/Decisions';
import Datasets from './pages/Datasets';
import Analytics from './pages/Analytics';
import ModelCard from './pages/ModelCard';
import DataViz from './pages/DataViz';
import React from 'react';
const Calendar = React.lazy(() => import('./pages/Calendar'));
const Settings = React.lazy(() => import('./pages/Settings'));
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionBanner from './components/ConnectionBanner';
import styles from './App.module.css';

const NAV = [
  { to: '/',            label: 'Dashboard',    icon: '▦',  end: true },
  { to: '/predictions', label: 'Predictions',  icon: '◎' },
  { to: '/forecast',    label: 'Forecast',     icon: '↗' },
  { to: '/decisions',   label: 'RL Decisions', icon: '⚡' },
  { to: '/inventory',   label: 'Inventory',    icon: '⬡' },
  { to: '/analytics',   label: 'Analytics',    icon: '⌬' },
  { to: '/products',    label: 'Products',     icon: '◈' },
  { to: '/datasets',    label: 'Datasets',     icon: '⊞' },
  { to: '/model-card',  label: 'Model Card',   icon: '◉' },
  { to: '/data-viz',    label: 'Data Viz',     icon: '◈' },
];

const PAGE_TITLES = {
  '/': 'Dashboard', '/predictions': 'Predictions', '/forecast': 'Forecast',
  '/decisions': 'RL Decisions', '/inventory': 'Inventory', '/analytics': 'Analytics',
  '/products': 'Products', '/datasets': 'Datasets', '/model-card': 'Model Card',
  '/data-viz': 'Data Visualizations', '/calendar': 'Demand Calendar', '/settings': 'Settings',
};

function Topbar() {
  const loc = useLocation();
  const title = PAGE_TITLES[loc.pathname] || 'DemandAI';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 28, paddingBottom: 20,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{dateStr} · AI-powered demand intelligence</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Notification bell */}
        <button style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--muted)', fontSize: 15, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#a5b4fc'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--muted)'; }}
        >🔔</button>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
          boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          cursor: 'pointer',
        }}>AI</div>
      </div>
    </div>
  );
}

function MainContent() {
  const loc = useLocation();
  return (
    <main className={styles.main}>
      <ConnectionBanner />
      <Topbar />
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}>
            <Routes location={loc}>
              <Route path="/"            element={<Dashboard />} />
              <Route path="/products"    element={<Products />} />
              <Route path="/predictions" element={<Predictions />} />
              <Route path="/forecast"    element={<Forecast />} />
              <Route path="/decisions"   element={<Decisions />} />
              <Route path="/inventory"   element={<Inventory />} />
              <Route path="/datasets"    element={<Datasets />} />
              <Route path="/analytics"   element={<Analytics />} />
              <Route path="/model-card"  element={<ModelCard />} />
              <Route path="/data-viz" element={<React.Suspense fallback={<div style={{padding:40,color:'var(--muted)',textAlign:'center'}}>Loading...</div>}><ErrorBoundary><DataViz /></ErrorBoundary></React.Suspense>} />
              <Route path="*" element={
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>404</div>
                  <p>Page not found</p>
                </div>
              } />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </ErrorBoundary>
    </main>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <motion.div className={styles.logo}
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}>
              <span className={styles.logoIcon}>⚡</span>
              <span className={styles.logoText}>DemandAI</span>
              <span className={styles.logoBadge}>v4</span>
            </motion.div>

            <div>
              <div className={styles.navLabel}>Main</div>
              <nav className={styles.nav}>
                {NAV.slice(0, 5).map((item, i) => (
                  <motion.div key={item.to}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}>
                    <NavLink to={item.to} end={item.end}
                      className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  </motion.div>
                ))}
              </nav>
            </div>

            <div>
              <div className={styles.navLabel}>Tools</div>
              <nav className={styles.nav}>
                {NAV.slice(5).map((item, i) => (
                  <motion.div key={item.to}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (i + 5) * 0.05 }}>
                    <NavLink to={item.to}
                      className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  </motion.div>
                ))}
              </nav>
            </div>

            <div className={styles.sidebarFooter}>
              <div className={styles.footerBadge}>
                <span className={styles.footerDot} />
                <span className={styles.footerText}>All systems operational</span>
              </div>
            </div>
          </aside>
          <MainContent />
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}







