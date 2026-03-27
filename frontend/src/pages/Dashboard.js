import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { insightsApi, externalApi } from '../api/client';
import { useSocket } from '../context/SocketContext';
import SalesChart from '../components/SalesChart';
import StatCard from '../components/StatCard';
import LiveFeed from '../components/LiveFeed';
import InsightBanner from '../components/InsightBanner';
import Skeleton from '../components/Skeleton';
import TopProductsChart from '../components/TopProductsChart';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { connected, dashboardUpdate, lastSale } = useSocket();
  const queryClient = useQueryClient();
  const [liveSales, setLiveSales] = useState([]);

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: () => insightsApi.getSummary().then((r) => r.data),
    refetchInterval: 60000
  });

  const { data: timeseries, isLoading: timeseriesLoading } = useQuery({
    queryKey: ['timeseries'],
    queryFn: () => insightsApi.getTimeseries(14).then((r) => r.data),
    refetchInterval: 30000
  });

  const { data: external } = useQuery({
    queryKey: ['external'],
    queryFn: () => externalApi.getLatest().then((r) => r.data),
    refetchInterval: 120000
  });

  useEffect(() => {
    if (lastSale) {
      setLiveSales((prev) => [lastSale, ...prev].slice(0, 20));
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    }
  }, [lastSale, queryClient]);

  const todayStats = dashboardUpdate?.todayStats || {};
  const lowStock = dashboardUpdate?.lowStockAlerts || insights?.lowStockAlerts || [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Real-time demand intelligence</p>
        </div>
        <div className={styles.statusBadge} data-connected={connected}>
          <span className={styles.dot} />
          {connected ? 'Live' : 'Reconnecting...'}
        </div>
      </div>

      {insights?.insights?.map((msg, i) => (
        <InsightBanner key={i} message={msg} />
      ))}

      <div className={styles.statsGrid}>
        {insightsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" />)
        ) : (
          <>
            <StatCard
              label="Sales Today"
              value={todayStats.qty || 0}
              unit="units"
              icon="📦"
              trend={insights?.demandChangePct}
            />
            <StatCard
              label="Revenue Today"
              value={`$${(todayStats.revenue || 0).toFixed(0)}`}
              icon="💰"
            />
            <StatCard
              label="Low Stock Alerts"
              value={lowStock.length}
              icon="⚠️"
              danger={lowStock.length > 0}
            />
            <StatCard
              label="Demand Trend"
              value={`${insights?.demandChangePct > 0 ? '+' : ''}${insights?.demandChangePct || 0}%`}
              icon="📈"
              trend={insights?.demandChangePct}
            />
          </>
        )}
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sales (Last 14 Days)</h2>
          {timeseriesLoading
            ? <Skeleton variant="row" count={5} height={20} />
            : <SalesChart data={timeseries || []} />
          }
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Live Sales Feed</h2>
          <LiveFeed sales={liveSales} />
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Top Products (Last 7 Days)</h2>
          <TopProductsChart products={insights?.topProducts} />
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Low Stock Alerts</h2>
          {lowStock.length === 0 ? (
            <p className={styles.empty}>All products adequately stocked.</p>
          ) : (
            <ul className={styles.alertList}>
              {lowStock.map((p) => (
                <li key={p._id} className={styles.alertItem}>
                  <span>{p.name}</span>
                  <span className={styles.stockBadge}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>External Signals</h2>
          {external ? (
            <div className={styles.externalGrid}>
              <div className={styles.externalItem}>
                <span className={styles.exLabel}>🌡 Temperature</span>
                <span>{external.weather?.temperature ?? 'N/A'}°C</span>
              </div>
              <div className={styles.externalItem}>
                <span className={styles.exLabel}>🌤 Weather</span>
                <span>{external.weather?.weatherCondition ?? 'N/A'}</span>
              </div>
              <div className={styles.externalItem}>
                <span className={styles.exLabel}>📊 Market Trend</span>
                <span>{external.trend?.trendScore?.toFixed(1) ?? 'N/A'} / 100</span>
              </div>
              {(external.weather?.fromCache || external.trend?.fromCache) && (
                <p className={styles.cacheNote}>Using cached external data</p>
              )}
            </div>
          ) : (
            <Skeleton variant="row" count={3} height={18} />
          )}
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>30-Day Summary</h2>
          <div className={styles.externalGrid}>
            <div className={styles.externalItem}>
              <span className={styles.exLabel}>Total Units Sold</span>
              <span>{insights?.totalSalesLast30Days ?? '—'}</span>
            </div>
            <div className={styles.externalItem}>
              <span className={styles.exLabel}>Total Revenue</span>
              <span>${(insights?.totalRevenueLast30Days || 0).toFixed(0)}</span>
            </div>
            <div className={styles.externalItem}>
              <span className={styles.exLabel}>Demand Change</span>
              <span style={{ color: (insights?.demandChangePct || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                {insights?.demandChangePct > 0 ? '+' : ''}{insights?.demandChangePct ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

