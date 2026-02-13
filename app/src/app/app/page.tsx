import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Percent,
} from "lucide-react"
import { formatCents, formatDate } from "@/lib/utils/format"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { PlatformBadge } from "@/components/layout/PlatformBadge"
import type { Platform } from "@/lib/utils/constants"

function statusColor(status: string) {
  switch (status) {
    case "delivered":
      return "default" as const
    case "shipped":
      return "secondary" as const
    case "processing":
    case "in_production":
      return "outline" as const
    case "pending":
    case "unfulfilled":
      return "outline" as const
    case "cancelled":
      return "destructive" as const
    default:
      return "secondary" as const
  }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch current period orders (last 30 days)
  const { data: currentOrders } = await supabase
    .from("orders")
    .select("total_cents, profit_cents")
    .eq("user_id", user.id)
    .gte("ordered_at", thirtyDaysAgo)

  // Fetch previous period orders (30-60 days ago)
  const { data: previousOrders } = await supabase
    .from("orders")
    .select("total_cents, profit_cents")
    .eq("user_id", user.id)
    .gte("ordered_at", sixtyDaysAgo)
    .lt("ordered_at", thirtyDaysAgo)

  // Calculate KPI values
  const currRevenue = (currentOrders ?? []).reduce((s, o) => s + (o.total_cents ?? 0), 0)
  const prevRevenue = (previousOrders ?? []).reduce((s, o) => s + (o.total_cents ?? 0), 0)

  const currCount = (currentOrders ?? []).length
  const prevCount = (previousOrders ?? []).length

  const currAov = currCount > 0 ? Math.round(currRevenue / currCount) : 0
  const prevAov = prevCount > 0 ? Math.round(prevRevenue / prevCount) : 0

  const currProfit = (currentOrders ?? []).reduce((s, o) => s + (o.profit_cents ?? 0), 0)
  const prevProfit = (previousOrders ?? []).reduce((s, o) => s + (o.profit_cents ?? 0), 0)
  const currMargin = currRevenue > 0 ? (currProfit / currRevenue) * 100 : 0
  const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0

  // Fetch daily_financials for revenue chart (last 30 days)
  const { data: dailyFinancials } = await supabase
    .from("daily_financials")
    .select("date, gross_revenue_cents, order_count")
    .eq("user_id", user.id)
    .gte("date", thirtyDaysAgo.slice(0, 10))
    .order("date", { ascending: true })

  // Aggregate daily_financials by date (multiple platforms per date)
  const dailyMap = new Map<string, { revenue: number; orders: number }>()
  for (const row of dailyFinancials ?? []) {
    const existing = dailyMap.get(row.date)
    if (existing) {
      existing.revenue += row.gross_revenue_cents
      existing.orders += row.order_count
    } else {
      dailyMap.set(row.date, {
        revenue: row.gross_revenue_cents,
        orders: row.order_count,
      })
    }
  }
  const chartData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      revenue: vals.revenue,
      orders: vals.orders,
    }))

  // Fetch recent orders
  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, platform_order_number, platform, total_cents, status, ordered_at, customer_id")
    .eq("user_id", user.id)
    .order("ordered_at", { ascending: false })
    .limit(10)

  // Fetch customer names for recent orders
  const customerIds = (recentOrders ?? [])
    .map((o) => o.customer_id)
    .filter((id): id is string => !!id)
  const { data: orderCustomers } = customerIds.length > 0
    ? await supabase
        .from("customers")
        .select("id, full_name")
        .in("id", customerIds)
    : { data: [] }
  const customerMap = new Map(
    (orderCustomers ?? []).map((c) => [c.id, c.full_name])
  )

  const hasOrders = (recentOrders ?? []).length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your POD business performance.
        </p>
      </div>

      {!hasOrders ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="mb-4 size-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No orders synced yet.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your stores to get started.
            </p>
            <Link
              href="/app/settings"
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Total Revenue"
              value={formatCents(currRevenue)}
              change={pctChange(currRevenue, prevRevenue)}
              changeLabel="vs last 30 days"
              icon={DollarSign}
            />
            <KpiCard
              title="Orders"
              value={String(currCount)}
              change={pctChange(currCount, prevCount)}
              changeLabel="vs last 30 days"
              icon={ShoppingCart}
            />
            <KpiCard
              title="Avg Order Value"
              value={formatCents(currAov)}
              change={pctChange(currAov, prevAov)}
              changeLabel="vs last 30 days"
              icon={TrendingUp}
            />
            <KpiCard
              title="Profit Margin"
              value={`${currMargin.toFixed(1)}%`}
              change={currMargin - prevMargin}
              changeLabel="vs last 30 days"
              icon={Percent}
            />
          </div>

          {/* Revenue Chart */}
          {chartData.length > 0 ? (
            <RevenueChart data={chartData} title="Revenue Over Time" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
                <CardDescription>
                  Daily revenue for the last 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="mx-auto mb-2 size-8" />
                    <p className="text-sm">No revenue data yet</p>
                    <p className="text-xs">Data will appear as orders sync</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Your latest orders across all platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentOrders ?? []).map((order) => {
                    const customerName =
                      (order.customer_id ? customerMap.get(order.customer_id) : null) ?? "---"
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/app/orders/${order.id}`}
                            className="text-primary hover:underline"
                          >
                            #{order.platform_order_number ?? order.id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PlatformBadge platform={order.platform as Platform} />
                        </TableCell>
                        <TableCell>{customerName}</TableCell>
                        <TableCell className="text-right">
                          {formatCents(order.total_cents)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColor(order.status ?? "")} className="capitalize">
                            {order.status ?? "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(order.ordered_at)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
