import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import styles from './ConnectionBanner.module.css';

export default function ConnectionBanner() {
  const { connected } = useSocket();
  const [wakingUp, setWakingUp] = useState(false);
  const [wakeSeconds, setWakeSeconds] = useState(0);

  useEffect(() => {
    if (!connected) {
      // After 3s of no connection, show "waking up" message
      const t = setTimeout(() => setWakingUp(true), 3000);
      return () => clearTimeout(t);
    } else {
      setWakingUp(false);
      setWakeSeconds(0);
    }
  }, [connected]);

  useEffect(() => {
    if (!wakingUp) return;
    const interval = setInterval(() => setWakeSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [wakingUp]);

  if (connected) return null;

  return (
    <div className={styles.banner}>
      <span className={styles.spinner} />
      {wakingUp ? (
        <span>
          Server is waking up ({wakeSeconds}s) — free tier cold start, ready in ~20s
        </span>
      ) : (
        <span>Connecting to live data stream...</span>
      )}
    </div>
  );
}
