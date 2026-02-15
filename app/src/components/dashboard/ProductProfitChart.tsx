"use client"

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ProductProfitDataPoint {
  name: string
  salesVelocity: number
  marginPct: number
  totalRevenue: number
}

interface ProductProfitChartProps {
  data: ProductProfitDataPoint[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value / 100)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: ProductProfitDataPoint
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const item = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md max-w-xs">
      <p className="text-sm font-medium mb-2 line-clamp-2">{item.name}</p>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Velocity:{" "}
          <span className="font-medium text-foreground">
            {item.salesVelocity.toFixed(1)}/day
          </span>
        </p>
        <p>
          Margin:{" "}
          <span className="font-medium text-foreground">
            {item.marginPct.toFixed(1)}%
          </span>
        </p>
        <p>
          Revenue:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(item.totalRevenue)}
          </span>
        </p>
      </div>
    </div>
  )
}

export function ProductProfitChart({ data }: ProductProfitChartProps) {
  if (data.length === 0) return null

  const maxRevenue = Math.max(...data.map((d) => d.totalRevenue))
  const minSize = 60
  const maxSize = 400

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Profitability Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                type="number"
                dataKey="salesVelocity"
                name="Sales Velocity"
                tickFormatter={(v) => `${v}/d`}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Sales Velocity (units/day)",
                  position: "insideBottom",
                  offset: -5,
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="marginPct"
                name="Margin %"
                tickFormatter={(v) => `${v}%`}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Margin %",
                  angle: -90,
                  position: "insideLeft",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 11,
                }}
              />
              <ZAxis
                type="number"
                dataKey="totalRevenue"
                range={[minSize, maxSize]}
                domain={[0, maxRevenue]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Scatter
                data={data}
                fill="hsl(var(--primary))"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Dot size represents total revenue. Top-right = high velocity + high margin.
        </p>
      </CardContent>
    </Card>
  )
}
