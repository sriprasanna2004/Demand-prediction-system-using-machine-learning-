import styles from './InsightBanner.module.css';

export default function InsightBanner({ message }) {
  const isWarning = message.toLowerCase().includes('drop') || message.toLowerCase().includes('low');
  const isPositive = message.toLowerCase().includes('increase') || message.toLowerCase().includes('stable');

  return (
    <div className={styles.banner} data-type={isWarning ? 'warning' : isPositive ? 'positive' : 'neutral'}>
      <span className={styles.icon}>{isWarning ? '⚠️' : isPositive ? '📈' : 'ℹ️'}</span>
      <span>{message}</span>
    </div>
  );
}
