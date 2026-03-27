import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function SalesChart({ data }) {
  if (!data.length) {
    return (
      <div style={{ color: 'var(--muted)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
        No sales data yet
      </div>
    );
  }

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
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(99,102,241,0.3)');
          gradient.addColorStop(1, 'rgba(99,102,241,0)');
          return gradient;
        },
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#0a0c14',
        pointBorderWidth: 2,
        pointHoverRadius: 6
      },
      {
        label: 'Revenue ($)',
        data: revenue,
        borderColor: '#06b6d4',
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(6,182,212,0.2)');
          gradient.addColorStop(1, 'rgba(6,182,212,0)');
          return gradient;
        },
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#0a0c14',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        yAxisID: 'y2'
      }
    ]
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#64748b', font: { size: 11, family: 'Inter' },
          usePointStyle: true, pointStyleWidth: 8
        }
      },
      tooltip: {
        backgroundColor: 'rgba(5,8,16,0.95)',
        borderColor: 'rgba(99,102,241,0.3)',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 10
      }
    },
    scales: {
      x: {
        ticks: { color: '#475569', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'rgba(255,255,255,0.06)' }
      },
      y: {
        ticks: { color: '#475569' },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'rgba(255,255,255,0.06)' }
      },
      y2: {
        position: 'right',
        ticks: { color: '#06b6d4' },
        grid: { display: false },
        border: { color: 'rgba(255,255,255,0.06)' }
      }
    }
  };

  return <Line data={chartData} options={options} />;
}
