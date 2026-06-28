import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SentimentData } from '@/types/insight'

interface SentimentChartProps {
  data: SentimentData
  title?: string
  height?: number
  className?: string
}

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  neutral: '#6b7280',
  negative: '#ef4444',
}

export function SentimentChart({
  data,
  title = 'Sentiment Distribution',
  height = 300,
  className,
}: SentimentChartProps) {
  const chartData = [
    { name: 'Positive', value: data.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: data.neutral, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: data.negative, color: SENTIMENT_COLORS.negative },
  ]

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <PieChart accessibilityLayer>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              nameKey="name"
              strokeWidth={2}
              label={({ name, value }) => `${name}: ${value}%`}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
