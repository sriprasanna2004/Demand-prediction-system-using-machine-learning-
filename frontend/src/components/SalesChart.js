import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function SalesChart({ data }) {
  const labels = data.map((d) => d._id);
  const qty = data.map((d) => d.totalQty);
  const revenue = data.map((d) => d.totalRevenue);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Units Sold',
        data: qty,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3
      },
      {
        label: 'Revenue ($)',
        data: revenue,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,0.05)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        yAxisID: 'y2'
      }
    ]
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#2e3250' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3250' } },
      y2: { position: 'right', ticks: { color: '#22d3ee' }, grid: { display: false } }
    }
  };

  if (!data.length) {
    return <div style={{ color: 'var(--muted)', padding: '40px 0', textAlign: 'center' }}>No sales data yet</div>;
  }

  return <Line data={chartData} options={options} />;
}
