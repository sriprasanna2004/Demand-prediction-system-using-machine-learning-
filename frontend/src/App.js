import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Predictions from './pages/Predictions';
import Inventory from './pages/Inventory';
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionBanner from './components/ConnectionBanner';
import styles from './App.module.css';

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>⚡</span>
              <span>DemandAI</span>
            </div>
            <nav className={styles.nav}>
              <NavLink to="/" end className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                📊 Dashboard
              </NavLink>
              <NavLink to="/products" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                📦 Products
              </NavLink>
              <NavLink to="/predictions" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                🤖 Predictions
              </NavLink>
              <NavLink to="/inventory" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
                🏭 Inventory
              </NavLink>
            </nav>
          </aside>
          <main className={styles.main}>
            <ConnectionBanner />
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/inventory" element={<Inventory />} />
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
