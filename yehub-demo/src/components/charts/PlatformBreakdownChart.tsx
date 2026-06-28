import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORM_CONFIG } from '@/lib/constants/platforms'
import type { Platform } from '@/types/filters'

interface PlatformData {
  platform: Platform | string
  value: number
  label?: string
}

interface PlatformBreakdownChartProps {
  data: PlatformData[]
  title?: string
  height?: number
  className?: string
}

export function PlatformBreakdownChart({
  data,
  title = 'Platform Breakdown',
  height = 300,
  className,
}: PlatformBreakdownChartProps) {
  const chartData = data.map(d => ({
    name: (PLATFORM_CONFIG as Record<string, { label: string }>)[d.platform]?.label || d.platform,
    value: d.value,
    color: (PLATFORM_CONFIG as Record<string, { color: string }>)[d.platform]?.color || '#6b7280',
  }))

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: {
    cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; index?: number
  }) => {
    if (cx == null || cy == null || midAngle == null || innerRadius == null || outerRadius == null || index == null) return null
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const percent = total > 0 ? ((chartData[index].value / total) * 100).toFixed(0) : '0'
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {percent}%
      </text>
    )
  }

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
              label={renderLabel}
              labelLine={false}
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
