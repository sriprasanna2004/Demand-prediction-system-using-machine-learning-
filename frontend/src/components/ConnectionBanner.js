import { useSocket } from '../context/SocketContext';

export default function ConnectionBanner() {
  const { connected } = useSocket();
  if (connected) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderRadius: 12, marginBottom: 16,
      background: 'rgba(245,158,11,0.08)',
      border: '1px solid rgba(245,158,11,0.2)',
      fontSize: 12.5, color: '#fbbf24', fontWeight: 500,
    }}>
      <span>⚡</span>
      Reconnecting to live feed — data may be delayed
    </div>
  );
}
