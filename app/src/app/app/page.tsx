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
  AlertTriangle,
  DollarSign,
  Loader2,
  ShoppingCart,
  TrendingUp,
  Percent,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatCents, formatDate } from "@/lib/utils/format"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { PlatformBadge } from "@/components/layout/PlatformBadge"
import type { Platform } from "@/lib/utils/constants"
import { RealtimeRefresh } from "@/components/dashboard/RealtimeRefresh"
import { PlatformRevenueChart } from "@/components/dashboard/PlatformRevenueChart"
import { DateRangePicker } from "@/components/dashboard/DateRangePicker"
import { LastSyncIndicator } from "@/components/dashboard/LastSyncIndicator"
import { Suspense } from "react"

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Check backfill status for banner
  const { data: profile } = await supabase
    .from("profiles")
    .select("backfill_status")
    .eq("user_id", user.id)
    .single()
  const backfillStatus = profile?.backfill_status as string | null

  const params = await searchParams
  const now = new Date()

  // Parse date range from searchParams, default to last 30 days
  const toDate = params.to ? new Date(params.to + "T23:59:59Z") : now
  const fromDate = params.from
    ? new Date(params.from + "T00:00:00Z")
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const rangeMs = toDate.getTime() - fromDate.getTime()
  const prevFrom = new Date(fromDate.getTime() - rangeMs)
  const prevTo = fromDate

  const fromIso = fromDate.toISOString()
  const toIso = toDate.toISOString()
  const prevFromIso = prevFrom.toISOString()
  const prevToIso = prevTo.toISOString()

  // Fetch current period orders
  const { data: currentOrders } = await supabase
    .from("orders")
    .select("total_cents, profit_cents")
    .eq("user_id", user.id)
    .gte("ordered_at", fromIso)
    .lte("ordered_at", toIso)

  // Fetch previous period orders (same-length window before)
  const { data: previousOrders } = await supabase
    .from("orders")
    .select("total_cents, profit_cents")
    .eq("user_id", user.id)
    .gte("ordered_at", prevFromIso)
    .lt("ordered_at", prevToIso)

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

  // Fetch daily_financials for revenue chart
  const fromDateStr = fromIso.slice(0, 10)
  const toDateStr = toIso.slice(0, 10)
  const { data: dailyFinancials } = await supabase
    .from("daily_financials")
    .select("date, platform, gross_revenue_cents, order_count")
    .eq("user_id", user.id)
    .gte("date", fromDateStr)
    .lte("date", toDateStr)
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

  // Aggregate revenue by platform
  const platformMap = new Map<string, number>()
  for (const row of dailyFinancials ?? []) {
    platformMap.set(
      row.platform,
      (platformMap.get(row.platform) ?? 0) + row.gross_revenue_cents
    )
  }
  const platformRevenueData = Array.from(platformMap.entries())
    .map(([platform, revenue]) => ({ platform, revenue }))
    .sort((a, b) => b.revenue - a.revenue)

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

  const changeLabel = params.from ? "vs previous period" : "vs last 30 days"

  return (
    <div className="space-y-6">
      <RealtimeRefresh userId={user.id} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your POD business performance.
          </p>
          <LastSyncIndicator userId={user.id} />
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      {backfillStatus === "in_progress" && (
        <Alert>
          <Loader2 className="size-4 animate-spin" />
          <AlertTitle>Syncing your data...</AlertTitle>
          <AlertDescription>
            We&apos;re importing your historical data. This may take a few minutes.
            The dashboard will update automatically.
          </AlertDescription>
        </Alert>
      )}

      {backfillStatus === "pending" && (
        <Alert>
          <Loader2 className="size-4 animate-spin" />
          <AlertTitle>Sync queued</AlertTitle>
          <AlertDescription>
            Your initial data sync is queued and will begin shortly.
          </AlertDescription>
        </Alert>
      )}

      {backfillStatus === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Data sync failed</AlertTitle>
          <AlertDescription>
            Something went wrong importing your data. Please check your platform
            connections in{" "}
            <Link href="/app/settings" className="underline">
              Settings
            </Link>{" "}
            and try reconnecting.
          </AlertDescription>
        </Alert>
      )}

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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              title="Total Revenue"
              value={formatCents(currRevenue)}
              change={pctChange(currRevenue, prevRevenue)}
              changeLabel={changeLabel}
              icon={DollarSign}
            />
            <KpiCard
              title="Orders"
              value={String(currCount)}
              change={pctChange(currCount, prevCount)}
              changeLabel={changeLabel}
              icon={ShoppingCart}
            />
            <KpiCard
              title="Avg Order Value"
              value={formatCents(currAov)}
              change={pctChange(currAov, prevAov)}
              changeLabel={changeLabel}
              icon={TrendingUp}
            />
            <KpiCard
              title="Profit Margin"
              value={`${currMargin.toFixed(1)}%`}
              change={currMargin - prevMargin}
              changeLabel={changeLabel}
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
                  Daily revenue for the selected period
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

          {/* Platform Revenue */}
          {platformRevenueData.length > 1 && (
            <PlatformRevenueChart data={platformRevenueData} />
          )}

          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Your latest orders across all platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="hidden md:table-cell">Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
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
                        <TableCell className="hidden md:table-cell">{customerName}</TableCell>
                        <TableCell className="text-right">
                          {formatCents(order.total_cents)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColor(order.status ?? "")} className="capitalize">
                            {order.status ?? "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDate(order.ordered_at)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
