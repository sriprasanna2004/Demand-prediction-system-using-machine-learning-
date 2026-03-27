import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function TopProductsChart({ products }) {
  if (!products?.length) {
    return <div style={{ color: 'var(--muted)', padding: '20px 0', textAlign: 'center', fontSize: 13 }}>No data yet</div>;
  }

  const data = {
    labels: products.map((p) => p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name),
    datasets: [
      {
        label: 'Units Sold (7d)',
        data: products.map((p) => p.qty),
        backgroundColor: 'rgba(99,102,241,0.7)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} units`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3250' } }
    }
  };

  return <Bar data={data} options={options} />;
}
