const shimmer = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.6s infinite',
  borderRadius: 8,
};

export default function Skeleton({ variant = 'row', count = 1, height = 16 }) {
  if (variant === 'card') return (
    <div style={{ ...shimmer, height: 120, borderRadius: 16 }} />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ ...shimmer, height, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
