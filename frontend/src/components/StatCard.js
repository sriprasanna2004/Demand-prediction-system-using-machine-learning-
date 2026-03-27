import { motion } from 'framer-motion';
import styles from './StatCard.module.css';

export default function StatCard({ label, value, unit, icon, trend, danger }) {
  return (
    <motion.div
      className={styles.card}
      data-danger={danger}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className={styles.top}>
        <div className={styles.iconWrap}>{icon}</div>
        {trend !== undefined && (
          <span className={styles.trend} data-positive={trend > 0}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '—'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <motion.div
        className={styles.value}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {value}{unit && <span className={styles.unit}> {unit}</span>}
      </motion.div>
      <div className={styles.label}>{label}</div>
    </motion.div>
  );
}
