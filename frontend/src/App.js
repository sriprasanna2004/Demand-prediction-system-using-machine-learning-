import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Predictions from './pages/Predictions';
import Inventory from './pages/Inventory';
import Forecast from './pages/Forecast';
import Decisions from './pages/Decisions';
import Datasets from './pages/Datasets';
import Analytics from './pages/Analytics';
import ModelCard from './pages/ModelCard';
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionBanner from './components/ConnectionBanner';
import styles from './App.module.css';

const NAV = [
  { to: '/',           label: 'Dashboard',   icon: '📊', end: true },
  { to: '/products',   label: 'Products',    icon: '📦' },
  { to: '/predictions',label: 'Predictions', icon: '🤖' },
  { to: '/forecast',   label: 'Forecast',    icon: '📈' },
  { to: '/decisions',  label: 'RL Decisions',icon: '⚡' },
  { to: '/inventory',  label: 'Inventory',   icon: '🏭' },
  { to: '/datasets',   label: 'Datasets',    icon: '🗂️' },
  { to: '/analytics',  label: 'Analytics',   icon: '🔬' },
  { to: '/model-card', label: 'Model Card',  icon: '📋' },
];

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <motion.div className={styles.logo}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <span className={styles.logoIcon}>⚡</span>
              <span className={styles.logoText}>DemandAI</span>
              <span className={styles.logoBadge}>v2</span>
            </motion.div>
            <nav className={styles.nav}>
              {NAV.map((item, i) => (
                <motion.div key={item.to}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}>
                  <NavLink to={item.to} end={item.end}
                    className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                </motion.div>
              ))}
            </nav>
            <div className={styles.sidebarFooter}>
              <div className={styles.footerBadge}>
                <span className={styles.footerDot} />
                <span className={styles.footerText}>Ensemble + PPO · All systems live</span>
              </div>
            </div>
          </aside>
          <main className={styles.main}>
            <ConnectionBanner />
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/forecast" element={<Forecast />} />
                <Route path="/decisions" element={<Decisions />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/datasets" element={<Datasets />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/model-card" element={<ModelCard />} />
                <Route path="*" element={
                  <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 48 }}>404</div>
                    <p style={{ marginTop: 12 }}>Page not found</p>
                  </div>
                } />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}
