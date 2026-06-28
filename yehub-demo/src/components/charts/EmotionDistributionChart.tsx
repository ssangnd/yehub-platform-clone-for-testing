import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EmotionDistribution } from '@/types/insight'

interface EmotionDistributionChartProps {
  data: EmotionDistribution[]
  title?: string
  height?: number
  className?: string
}

const EMOTION_COLORS: Record<string, string> = {
  joy: '#22c55e',
  anger: '#ef4444',
  sadness: '#3b82f6',
  fear: '#a855f7',
  surprise: '#f59e0b',
  disgust: '#6b7280',
}

const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joy',
  anger: 'Anger',
  sadness: 'Sadness',
  fear: 'Fear',
  surprise: 'Surprise',
  disgust: 'Disgust',
}

export function EmotionDistributionChart({
  data,
  title = 'Emotion Distribution',
  height = 300,
  className,
}: EmotionDistributionChartProps) {
  const chartData = data.map(d => ({
    name: EMOTION_LABELS[d.emotion] || d.emotion,
    value: d.percentage,
    count: d.count,
    color: EMOTION_COLORS[d.emotion] || '#6b7280',
  }))

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <BarChart data={chartData} layout="vertical" accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'currentColor', fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Percentage']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
