import styles from './DataQualityBadge.module.css';

/**
 * Displays a data quality indicator with label.
 * score: 0.0 – 1.0
 */
export default function DataQualityBadge({ score, dataPoints }) {
  const pct = Math.round((score || 0) * 100);
  const tier = pct >= 70 ? 'high' : pct >= 30 ? 'medium' : 'low';
  const labels = { high: 'High Quality', medium: 'Moderate', low: 'Sparse Data' };

  return (
    <div className={styles.badge} data-tier={tier}>
      <span className={styles.dot} />
      <span className={styles.label}>{labels[tier]}</span>
      <span className={styles.pct}>{pct}%</span>
      {dataPoints !== undefined && (
        <span className={styles.points}>{dataPoints} records</span>
      )}
    </div>
  );
}
