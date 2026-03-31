import styles from './ConfidenceMeter.module.css';

export default function ConfidenceMeter({ score }) {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  const label = pct >= 70 ? 'High Confidence' : pct >= 40 ? 'Moderate Confidence' : 'Low Confidence';

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Confidence Score</span>
        <span className={styles.pct} style={{ color }}>{pct}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className={styles.sublabel} style={{ color }}>{label}</div>
    </div>
  );
}
