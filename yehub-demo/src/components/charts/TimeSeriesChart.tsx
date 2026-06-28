import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SeriesConfig {
  key: string
  label: string
  color: string
}

interface TimeSeriesChartProps {
  data: object[]
  series: SeriesConfig[]
  xKey?: string
  title?: string
  type?: 'line' | 'area'
  height?: number
  className?: string
}

export function TimeSeriesChart({
  data,
  series,
  xKey = 'date',
  title,
  type = 'line',
  height = 300,
  className,
}: TimeSeriesChartProps) {
  const ChartComponent = type === 'area' ? AreaChart : LineChart

  const chart = (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <ChartComponent data={data} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={xKey}
          className="text-xs"
          tick={{ fill: 'currentColor' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'currentColor' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend />
        {series.map((s) =>
          type === 'area' ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )
        )}
      </ChartComponent>
    </ResponsiveContainer>
  )

  if (title) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>{chart}</CardContent>
      </Card>
    )
  }

  return <div className={className}>{chart}</div>
}
