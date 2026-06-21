import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

export default function StreamChart({ label, color, x, y }) {
  if (!y?.length) return null
  const data = {
    labels: x,
    datasets: [{ label, data: y, borderColor: color, pointRadius: 0, borderWidth: 2, tension: 0.3 }],
  }
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { display: false } },
  }
  return (
    <div className="chart">
      <h4>{label}</h4>
      <Line data={data} options={options} />
    </div>
  )
}
