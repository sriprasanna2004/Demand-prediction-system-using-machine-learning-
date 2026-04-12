import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ErrorBoundary from "./components/ErrorBoundary";
import ConnectionBanner from "./components/ConnectionBanner";
import styles from "./App.module.css";

const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Products       = lazy(() => import("./pages/Products"));
const Inventory      = lazy(() => import("./pages/Inventory"));
const Predictions    = lazy(() => import("./pages/Predictions"));
const Forecast       = lazy(() => import("./pages/Forecast"));
const Analytics      = lazy(() => import("./pages/Analytics"));
const Decisions      = lazy(() => import("./pages/Decisions"));
const Datasets       = lazy(() => import("./pages/Datasets"));
const DataViz        = lazy(() => import("./pages/DataViz"));
const Calendar       = lazy(() => import("./pages/Calendar"));
const ModelCard      = lazy(() => import("./pages/ModelCard"));
const SupplyChain    = lazy(() => import("./pages/SupplyChain"));
const Suppliers      = lazy(() => import("./pages/Suppliers"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Settings       = lazy(() => import("./pages/Settings"));

const MAIN_NAV = [
  { to: "/",             label: "Dashboard",   icon: "▦" },
  { to: "/predictions",  label: "Predictions", icon: "◎" },
  { to: "/forecast",     label: "Forecast",    icon: "◬" },
  { to: "/decisions",    label: "RL Decisions",icon: "◆" },
  { to: "/inventory",    label: "Inventory",   icon: "▤" },
];

const TOOLS_NAV = [
  { to: "/analytics",       label: "Analytics",       icon: "◉" },
  { to: "/products",        label: "Products",         icon: "◈" },
  { to: "/datasets",        label: "Datasets",         icon: "▦" },
  { to: "/model-card",      label: "Model Card",       icon: "◩" },
  { to: "/data-viz",        label: "Data Viz",         icon: "▣" },
];

const SUPPLY_NAV = [
  { to: "/supply-chain",    label: "Supply Chain",     icon: "⬡" },
  { to: "/suppliers",       label: "Suppliers",        icon: "◫" },
  { to: "/purchase-orders", label: "Purchase Orders",  icon: "◧" },
  { to: "/calendar",        label: "Calendar",         icon: "▨" },
  { to: "/settings",        label: "Settings",         icon: "◌" },
];

function Fallback() {
  return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9ca3af" }}>Loading...</div>;
}

function NavGroup({ label, items }) {
  return (
    <div>
      <div className={styles.navLabel}>{label}</div>
      <div className={styles.nav}>
        {items.map(({ to, label: lbl, icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
            <span className={styles.navIcon}>{icon}</span>
            <span>{lbl}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>D</div>
          <span className={styles.logoText}>DemandAI</span>
          <span className={styles.logoBadge}>v4</span>
        </div>

        <NavGroup label="MAIN"   items={MAIN_NAV}   />
        <NavGroup label="TOOLS"  items={TOOLS_NAV}  />
        <NavGroup label="SUPPLY" items={SUPPLY_NAV} />

        <div className={styles.sidebarFooter}>
          <div className={styles.footerBadge}>
            <span className={styles.footerDot} />
            <span className={styles.footerText}>All systems operational</span>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <ConnectionBanner />
        <ErrorBoundary>
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/"                 element={<Dashboard />} />
              <Route path="/supply-chain"     element={<SupplyChain />} />
              <Route path="/products"         element={<Products />} />
              <Route path="/inventory"        element={<Inventory />} />
              <Route path="/predictions"      element={<Predictions />} />
              <Route path="/forecast"         element={<Forecast />} />
              <Route path="/analytics"        element={<Analytics />} />
              <Route path="/decisions"        element={<Decisions />} />
              <Route path="/data-viz"         element={<DataViz />} />
              <Route path="/datasets"         element={<Datasets />} />
              <Route path="/suppliers"        element={<Suppliers />} />
              <Route path="/purchase-orders"  element={<PurchaseOrders />} />
              <Route path="/calendar"         element={<Calendar />} />
              <Route path="/model-card"       element={<ModelCard />} />
              <Route path="/settings"         element={<Settings />} />
              <Route path="*"                 element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
