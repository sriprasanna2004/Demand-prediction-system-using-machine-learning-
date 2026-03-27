import { useSocket } from '../context/SocketContext';
import styles from './ConnectionBanner.module.css';

export default function ConnectionBanner() {
  const { connected } = useSocket();
  if (connected) return null;

  return (
    <div className={styles.banner}>
      <span>⚡</span>
      <span>Connecting to live data stream...</span>
      <span className={styles.spinner} />
    </div>
  );
}
