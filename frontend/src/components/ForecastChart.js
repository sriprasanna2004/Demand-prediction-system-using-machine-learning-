import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function ForecastChart({ data = [], compareData = [], horizon }) {
  if (!data.length) return null;

  const labels = data.map(d => d.time);
  const datasets = [
    {
      label: 'Upper Bound',
      data: data.map(d => d.upper),
      borderColor: 'rgba(99,102,241,0.2)',
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: '+1', tension: 0.4, pointRadius: 0, borderDash: [4, 4]
    },
    {
      label: 'Predicted Demand',
      data: data.map(d => d.value),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.15)',
      fill: false, tension: 0.4, pointRadius: 3,
      pointBackgroundColor: '#6366f1'
    },
    {
      label: 'Lower Bound',
      data: data.map(d => d.lower),
      borderColor: 'rgba(99,102,241,0.2)',
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: '-1', tension: 0.4, pointRadius: 0, borderDash: [4, 4]
    },
  ];

  if (compareData?.length) {
    datasets.push({
      label: 'Compare Product',
      data: compareData.map(d => d.value),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.1)',
      fill: false, tension: 0.4, pointRadius: 3,
      pointBackgroundColor: '#10b981',
      borderDash: [6, 3]
    });
  }

  const options = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 }, filter: (item) => item.text === 'Predicted Demand' } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} units` } }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 12 }, grid: { color: '#2e3250' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3250' }, min: 0 }
    }
  };

  const chartData = { labels, datasets };

  return <Line data={chartData} options={options} />;
}
