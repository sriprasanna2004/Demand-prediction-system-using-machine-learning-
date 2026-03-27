import styles from './StatCard.module.css';

export default function StatCard({ label, value, unit, icon, trend, danger }) {
  return (
    <div className={styles.card} data-danger={danger}>
      <div className={styles.top}>
        <span className={styles.icon}>{icon}</span>
        {trend !== undefined && (
          <span className={styles.trend} data-positive={trend > 0}>
            {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className={styles.value}>{value}{unit && <span className={styles.unit}> {unit}</span>}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
