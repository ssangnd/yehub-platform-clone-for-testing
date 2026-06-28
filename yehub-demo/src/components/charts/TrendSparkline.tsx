import { LineChart, Line } from 'recharts'

interface TrendSparklineProps {
  data: number[]
  trend?: number
  width?: number
  height?: number
}

export function TrendSparkline({ data, trend, width = 80, height = 32 }: TrendSparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }))
  const color = trend !== undefined ? (trend >= 0 ? '#22c55e' : '#ef4444') : '#3b82f6'

  return (
    <LineChart data={chartData} width={width} height={height}>
      <Line
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
      />
    </LineChart>
  )
}
