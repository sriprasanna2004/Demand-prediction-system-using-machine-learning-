import styles from './Skeleton.module.css';

/**
 * Generic shimmer skeleton for loading states.
 * Usage: <Skeleton width="100%" height={20} />
 *        <Skeleton variant="card" />
 */
export default function Skeleton({ width = '100%', height = 16, variant, count = 1 }) {
  if (variant === 'card') {
    return (
      <div className={styles.card}>
        <div className={styles.shimmer} style={{ width: '40%', height: 12 }} />
        <div className={styles.shimmer} style={{ width: '70%', height: 28, marginTop: 8 }} />
        <div className={styles.shimmer} style={{ width: '50%', height: 12, marginTop: 8 }} />
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={styles.shimmer} style={{ width, height }} />
        ))}
      </div>
    );
  }

  return <div className={styles.shimmer} style={{ width, height }} />;
}
