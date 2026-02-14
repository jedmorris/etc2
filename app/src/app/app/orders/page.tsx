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
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download } from "lucide-react"
import { formatCents, formatDate } from "@/lib/utils/format"
import { PlatformBadge } from "@/components/layout/PlatformBadge"
import type { Platform } from "@/lib/utils/constants"

function statusVariant(status: string) {
  switch (status) {
    case "shipped":
      return "secondary" as const
    case "delivered":
      return "default" as const
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

function statusClassName(status: string) {
  switch (status) {
    case "shipped":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
    case "delivered":
      return "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
    case "processing":
    case "in_production":
      return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
    case "pending":
    case "unfulfilled":
      return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
    default:
      return ""
  }
}

function fulfillmentClassName(status: string) {
  switch (status) {
    case "shipped":
    case "in_transit":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
    case "delivered":
      return "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
    case "in_production":
      return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
    case "unfulfilled":
      return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
    default:
      return ""
  }
}

const platformFilters = [
  { label: "All", value: "" },
  { label: "Etsy", value: "etsy" },
  { label: "Shopify", value: "shopify" },
  { label: "Printify", value: "printify" },
] as const

const statusFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
] as const

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const

const PAGE_SIZE = 50

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; status?: string; q?: string; page?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const params = await searchParams
  const platformFilter = params.platform ?? ""
  const statusFilter = params.status ?? ""
  const searchQuery = params.q ?? ""
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  const fromFilter = params.from && dateRegex.test(params.from) ? params.from : ""
  const toFilter = params.to && dateRegex.test(params.to) ? params.to : ""
  const todayStr = new Date().toISOString().split("T")[0]

  // Build count query for total
  let countQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  if (platformFilter) countQuery = countQuery.eq("platform", platformFilter)
  if (statusFilter) countQuery = countQuery.eq("status", statusFilter)
  if (searchQuery) countQuery = countQuery.ilike("platform_order_number", `%${searchQuery}%`)
  if (fromFilter) countQuery = countQuery.gte("ordered_at", fromFilter)
  if (toFilter) countQuery = countQuery.lte("ordered_at", toFilter + "T23:59:59.999Z")

  const { count: totalCount } = await countQuery
  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Build query
  let query = supabase
    .from("orders")
    .select("id, platform_order_number, platform, status, fulfillment_status, total_cents, ordered_at")
    .eq("user_id", user.id)
    .order("ordered_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (platformFilter) {
    query = query.eq("platform", platformFilter)
  }
  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }
  if (searchQuery) {
    query = query.ilike("platform_order_number", `%${searchQuery}%`)
  }
  if (fromFilter) {
    query = query.gte("ordered_at", fromFilter)
  }
  if (toFilter) {
    query = query.lte("ordered_at", toFilter + "T23:59:59.999Z")
  }

  const { data: orders } = await query
  const orderList = orders ?? []

  // Build filter URL helper
  function filterUrl(overrides: Record<string, string>) {
    const merged: Record<string, string> = { platform: platformFilter, status: statusFilter, q: searchQuery, from: fromFilter, to: toFilter, ...overrides }
    // Reset to page 1 when filters change (unless page is explicitly set)
    if (!overrides.page) delete merged.page
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v)
    }
    const qs = sp.toString()
    return `/app/orders${qs ? `?${qs}` : ""}`
  }

  // Build export URL with current filters
  const exportParams = new URLSearchParams()
  if (fromFilter) exportParams.set("from", fromFilter)
  if (toFilter) exportParams.set("to", toFilter)
  const exportQs = exportParams.toString()
  const exportUrl = `/api/orders/export${exportQs ? `?${exportQs}` : ""}`

  function pageUrl(p: number) {
    return filterUrl({ page: String(p) })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            All orders across your connected stores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((preset) => {
            const presetFrom = new Date()
            presetFrom.setDate(presetFrom.getDate() - preset.days)
            const pFrom = presetFrom.toISOString().split("T")[0]
            const isActive = fromFilter === pFrom && toFilter === todayStr
            return (
              <Link
                key={preset.days}
                href={filterUrl({ from: pFrom, to: todayStr })}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {preset.label}
              </Link>
            )
          })}
          <Link
            href={filterUrl({ from: "", to: "" })}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !fromFilter && !toFilter
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            All
          </Link>

          <a href={exportUrl} download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 size-4" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Order History</CardTitle>
              <CardDescription>
                {total} order{total !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <form action="/app/orders" method="GET">
              {platformFilter && <input type="hidden" name="platform" value={platformFilter} />}
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              <div className="relative">
                <input
                  type="text"
                  name="q"
                  placeholder="Search by order #..."
                  defaultValue={searchQuery}
                  className="h-9 w-64 rounded-md border border-input bg-background px-3 py-1 pl-8 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </form>
          </div>

          {/* Platform filter pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground self-center">Platform:</span>
            {platformFilters.map((pf) => (
              <Link
                key={pf.value}
                href={filterUrl({ platform: pf.value })}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  platformFilter === pf.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {pf.label}
              </Link>
            ))}

            <span className="ml-4 mr-1 text-xs font-medium text-muted-foreground self-center">Status:</span>
            {statusFilters.map((sf) => (
              <Link
                key={sf.value}
                href={filterUrl({ status: sf.value })}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === sf.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {sf.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderList.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/app/orders/${order.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      #{order.platform_order_number ?? order.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PlatformBadge platform={order.platform as Platform} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`capitalize ${statusClassName(order.status ?? "")}`}
                    >
                      {(order.status ?? "unknown").replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`capitalize ${fulfillmentClassName(order.fulfillment_status ?? "")}`}
                    >
                      {(order.fulfillment_status ?? "---").replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCents(order.total_cents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(order.ordered_at)}
                  </TableCell>
                </TableRow>
              ))}
              {orderList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageUrl(page - 1)}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageUrl(page + 1)}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
