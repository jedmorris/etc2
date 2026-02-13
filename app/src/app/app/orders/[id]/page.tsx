import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft } from "lucide-react"
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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Fetch order
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!order) notFound()

  // Fetch line items
  const { data: lineItems } = await supabase
    .from("order_line_items")
    .select("*")
    .eq("order_id", id)

  const items = lineItems ?? []

  // Calculate total fees
  const totalFees =
    order.platform_fee_cents +
    order.transaction_fee_cents +
    order.payment_processing_fee_cents +
    order.listing_fee_cents +
    (order.printify_production_cost_cents ?? 0) +
    (order.printify_shipping_cost_cents ?? 0)

  const computedProfit = order.profit_cents ?? (order.total_cents - totalFees)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/app/orders"
          className="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Order #{order.platform_order_number ?? order.id.slice(0, 8)}
            </h1>
            <PlatformBadge platform={order.platform as Platform} />
            <Badge
              variant="outline"
              className={`capitalize ${statusClassName(order.status ?? "")}`}
            >
              {(order.status ?? "unknown").replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Placed on {formatDate(order.ordered_at)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Summary + Line Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>
              {items.length} item{items.length !== 1 ? "s" : ""} in this order
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.title}
                        {item.variant_title && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({item.variant_title})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.sku ?? "---"}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(item.unit_price_cents)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCents(item.total_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No line items found.</p>
            )}

            {/* Order totals */}
            <div className="mt-6 space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCents(order.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatCents(order.shipping_cents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCents(order.tax_cents)}</span>
              </div>
              {order.discount_cents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-destructive">
                    -{formatCents(order.discount_cents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatCents(order.total_cents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Net Profit</span>
                <span className={computedProfit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                  {computedProfit >= 0 ? "" : "-"}{formatCents(Math.abs(computedProfit))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column: Fees + Fulfillment */}
        <div className="space-y-6">
          {/* Fee Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Fee Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Platform Fee</span>
                <span className="text-destructive">
                  -{formatCents(order.platform_fee_cents)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Transaction Fee</span>
                <span className="text-destructive">
                  -{formatCents(order.transaction_fee_cents)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Processing</span>
                <span className="text-destructive">
                  -{formatCents(order.payment_processing_fee_cents)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Listing Fee</span>
                <span className="text-destructive">
                  -{formatCents(order.listing_fee_cents)}
                </span>
              </div>
              {(order.printify_production_cost_cents ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">COGS (Production)</span>
                  <span className="text-destructive">
                    -{formatCents(order.printify_production_cost_cents!)}
                  </span>
                </div>
              )}
              {(order.printify_shipping_cost_cents ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping Cost</span>
                  <span className="text-destructive">
                    -{formatCents(order.printify_shipping_cost_cents!)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total Fees / Costs</span>
                <span className="text-destructive">
                  -{formatCents(totalFees)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Fulfillment */}
          <Card>
            <CardHeader>
              <CardTitle>Fulfillment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={`capitalize ${statusClassName(order.fulfillment_status ?? "")}`}
                >
                  {(order.fulfillment_status ?? "unfulfilled").replace("_", " ")}
                </Badge>
              </div>

              {order.tracking_number && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tracking</span>
                  {order.tracking_url ? (
                    <a
                      href={order.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {order.tracking_number}
                    </a>
                  ) : (
                    <span className="text-sm font-medium">{order.tracking_number}</span>
                  )}
                </div>
              )}

              {order.carrier && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Carrier</span>
                  <span className="text-sm font-medium">{order.carrier}</span>
                </div>
              )}

              {order.shipped_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Shipped</span>
                  <span className="text-sm">{formatDate(order.shipped_at)}</span>
                </div>
              )}

              {order.delivered_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Delivered</span>
                  <span className="text-sm">{formatDate(order.delivered_at)}</span>
                </div>
              )}

              {!order.tracking_number && !order.shipped_at && (
                <p className="text-sm text-muted-foreground">
                  No fulfillment info yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
