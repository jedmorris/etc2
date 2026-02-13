import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ShoppingCart,
  DollarSign,
  CalendarDays,
  TrendingUp,
  Lock,
} from "lucide-react";
import {
  formatCents,
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "@/lib/utils/format";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { PlatformBadge } from "@/components/layout/PlatformBadge";
import type { Platform } from "@/lib/utils/constants";

const RFM_COLORS: Record<string, string> = {
  champion:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  loyal: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  new: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  promising:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  at_risk:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  needs_attention:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  lost: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  potential:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  hibernating:
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

function rfmLabel(segment: string): string {
  return segment
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function RfmBadge({ segment }: { segment: string | null }) {
  if (!segment) return <Badge variant="outline">Unknown</Badge>;
  const colorClass = RFM_COLORS[segment] ?? "";
  return (
    <Badge variant="outline" className={colorClass}>
      {rfmLabel(segment)}
    </Badge>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Customer CRM</CardTitle>
          <CardDescription>
            Customer insights and RFM segmentation require the Growth plan or
            above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/settings/billing">
            <Button>Upgrade to Growth</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function RfmScoreBar({ label, value }: { label: string; value: number | null }) {
  const score = value ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/5</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "crm")) {
    return <UpgradePrompt />;
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!customer) {
    notFound();
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", id)
    .eq("user_id", user.id)
    .order("ordered_at", { ascending: false })
    .limit(20);

  const orderList = orders ?? [];

  const avgOrderCents =
    customer.order_count && customer.order_count > 0
      ? Math.round((customer.total_spent_cents ?? 0) / customer.order_count)
      : 0;

  const locationParts = [customer.city, customer.state, customer.country].filter(
    Boolean
  );
  const location = locationParts.length > 0 ? locationParts.join(", ") : null;

  const platformIds = [
    customer.etsy_customer_id && { label: "Etsy", value: customer.etsy_customer_id },
    customer.shopify_customer_id && { label: "Shopify", value: customer.shopify_customer_id },
    customer.printify_customer_id && { label: "Printify", value: customer.printify_customer_id },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/app/customers">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {customer.full_name || customer.email}
          </h1>
          <p className="text-muted-foreground">{customer.email}</p>
        </div>
        <div className="ml-auto">
          <RfmBadge segment={customer.rfm_segment} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Total Orders
            </CardDescription>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(customer.order_count ?? 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Total Spent
            </CardDescription>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCents(customer.total_spent_cents ?? 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Avg Order Value
            </CardDescription>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCents(avgOrderCents)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Last Order
            </CardDescription>
            <CalendarDays className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customer.last_order_at
                ? formatRelativeTime(customer.last_order_at)
                : "Never"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer info + RFM scores */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{customer.email}</span>
            </div>
            {location && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Location</span>
                <span>{location}</span>
              </div>
            )}
            {platformIds.map((pid) => (
              <div key={pid.label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{pid.label} ID</span>
                <span className="font-mono text-xs">{pid.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* RFM Scores */}
        <Card>
          <CardHeader>
            <CardTitle>RFM Scores</CardTitle>
            <CardDescription>
              Recency, Frequency, and Monetary scoring
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RfmScoreBar label="Recency" value={customer.rfm_recency} />
            <RfmScoreBar label="Frequency" value={customer.rfm_frequency} />
            <RfmScoreBar label="Monetary" value={customer.rfm_monetary} />
          </CardContent>
        </Card>
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            Recent orders placed by this customer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderList.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              No orders found for this customer.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
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
                      {order.platform ? (
                        <PlatformBadge
                          platform={order.platform as Platform}
                        />
                      ) : (
                        <Badge variant="outline">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(order.total_cents ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === "delivered"
                            ? "default"
                            : order.status === "cancelled" ||
                                order.status === "refunded"
                              ? "destructive"
                              : "secondary"
                        }
                        className="capitalize"
                      >
                        {order.status ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.ordered_at
                        ? formatDate(order.ordered_at)
                        : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
