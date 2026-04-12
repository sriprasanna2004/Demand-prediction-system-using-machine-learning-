import React, { Suspense, lazy } from "react";
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
const Login          = lazy(() => import("./pages/Login"));

const NAV = [
  { to: "/",                label: "Dashboard"       },
  { to: "/supply-chain",    label: "Supply Chain"    },
  { to: "/products",        label: "Products"        },
  { to: "/inventory",       label: "Inventory"       },
  { to: "/predictions",     label: "Predictions"     },
  { to: "/forecast",        label: "Forecast"        },
  { to: "/analytics",       label: "Analytics"       },
  { to: "/decisions",       label: "Decisions"       },
  { to: "/data-viz",        label: "Data Viz"        },
  { to: "/datasets",        label: "Datasets"        },
  { to: "/suppliers",       label: "Suppliers"       },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/calendar",        label: "Calendar"        },
  { to: "/model-card",      label: "Model Card"      },
  { to: "/settings",        label: "Settings"        },
];

function Fallback() {
  return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9ca3af" }}>Loading...</div>;
}

function AppShell() {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <Suspense fallback={<Fallback />}>
        <Routes><Route path="*" element={<Login />} /></Routes>
      </Suspense>
    );
  }
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandText}>DemandAI</span>
        </div>
        <nav className={styles.nav}>
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => styles.navItem + (isActive ? " " + styles.navActive : "")}>
              <span className={styles.navLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className={styles.logoutBtn} onClick={logout}>Sign Out</button>
      </aside>
      <div className={styles.main}>
        <ConnectionBanner />
        <div className={styles.content}>
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
