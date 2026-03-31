import styles from './Skeleton.module.css';

export default function Skeleton({ width = '100%', height = 16, variant, count = 1 }) {
  if (variant === 'card') {
    return <div className={`${styles.base} ${styles.card}`} />;
  }
  if (variant === 'row') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`${styles.base} ${styles.row}`}
            style={{ width, '--h': `${height}px`, opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }
  return <div className={styles.base} style={{ width, height }} />;
}
