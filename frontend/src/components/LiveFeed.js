import styles from './LiveFeed.module.css';

export default function LiveFeed({ sales }) {
  if (!sales.length) {
    return <div className={styles.empty}>Waiting for live sales data...</div>;
  }

  return (
    <ul className={styles.list}>
      {sales.map((s, i) => (
        <li key={s._id || i} className={styles.item} style={{ animationDelay: `${i * 30}ms` }}>
          <span className={styles.dot} />
          <div className={styles.info}>
            <span className={styles.name}>
              {s.productId?.name || 'Product'}
            </span>
            <span className={styles.meta}>
              {s.quantity} units · {s.source === 'simulated' ? ' simulated' : '👤 manual'}
            </span>
          </div>
          <span className={styles.time}>
            {new Date(s.timestamp || s.createdAt).toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

