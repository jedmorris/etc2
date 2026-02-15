"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface PlatformProfitDataPoint {
  platform: string
  marginPct: number
}

interface PlatformProfitChartProps {
  data: PlatformProfitDataPoint[]
}

function platformLabel(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
    payload: PlatformProfitDataPoint
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const item = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{platformLabel(item.platform)}</p>
      <p className="text-sm text-muted-foreground">
        Net Margin:{" "}
        <span className="font-medium text-foreground">
          {item.marginPct.toFixed(1)}%
        </span>
      </p>
    </div>
  )
}

export function PlatformProfitChart({ data }: PlatformProfitChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    name: platformLabel(d.platform),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Profitability</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v}%`}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="marginPct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.marginPct >= 0
                        ? "hsl(142, 71%, 45%)"
                        : "hsl(0, 84%, 60%)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
