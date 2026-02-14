"use client"

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface RfmSegmentDataPoint {
  segment: string
  count: number
}

interface RfmSegmentChartProps {
  data: RfmSegmentDataPoint[]
}

const SEGMENT_COLORS: Record<string, string> = {
  champion: "#16a34a",
  loyal: "#2563eb",
  new: "#06b6d4",
  promising: "#9333ea",
  at_risk: "#ea580c",
  needs_attention: "#ca8a04",
  lost: "#dc2626",
  potential: "#4f46e5",
  hibernating: "#6b7280",
}

function segmentLabel(segment: string): string {
  return segment
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
    name: string
    payload: { segment: string; count: number; label: string }
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0]

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{data.name}</p>
      <p className="text-sm text-muted-foreground">
        Customers:{" "}
        <span className="font-medium text-foreground">
          {data.value.toLocaleString()}
        </span>
      </p>
    </div>
  )
}

export function RfmSegmentChart({ data }: RfmSegmentChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: segmentLabel(d.segment),
    fill: SEGMENT_COLORS[d.segment] ?? "#6b7280",
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Segments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.segment} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
