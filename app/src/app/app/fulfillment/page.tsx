import Link from "next/link";
import { redirect } from "next/navigation";
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
import { Lock, Package, Truck, CheckCircle, Clock } from "lucide-react";
import {
  formatCents,
  formatRelativeTime,
} from "@/lib/utils/format";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { PlatformBadge } from "@/components/layout/PlatformBadge";
import type { Platform } from "@/lib/utils/constants";

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Fulfillment Tracking</CardTitle>
          <CardDescription>
            Track order fulfillment across all production partners. Requires the
            Growth plan or above.
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

interface OrderRow {
  id: string;
  platform_order_number: string | null;
  platform: string | null;
  total_cents: number | null;
  ordered_at: string | null;
  fulfillment_status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}

interface PipelineColumn {
  key: string;
  label: string;
  icon: typeof Clock;
  color: string;
  orders: OrderRow[];
}

export default async function FulfillmentPage() {
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

  if (!hasFeature(plan, "fulfillment")) {
    return <UpgradePrompt />;
  }

  // Fetch active (non-delivered) orders
  const { data: activeOrders } = await supabase
    .from("orders")
    .select(
      "id, platform_order_number, platform, total_cents, ordered_at, fulfillment_status, tracking_number, tracking_url"
    )
    .eq("user_id", user.id)
    .not("fulfillment_status", "eq", "delivered")
    .order("ordered_at", { ascending: true })
    .limit(100);

  // Fetch recently delivered (last 7 days)
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: deliveredOrders } = await supabase
    .from("orders")
    .select(
      "id, platform_order_number, platform, total_cents, ordered_at, fulfillment_status, tracking_number, tracking_url"
    )
    .eq("user_id", user.id)
    .eq("fulfillment_status", "delivered")
    .gte("delivered_at", sevenDaysAgo)
    .order("ordered_at", { ascending: false })
    .limit(20);

  const allActive = (activeOrders ?? []) as OrderRow[];
  const delivered = (deliveredOrders ?? []) as OrderRow[];

  // Group active orders into columns
  const unfulfilled = allActive.filter(
    (o) => !o.fulfillment_status || o.fulfillment_status === "unfulfilled"
  );
  const inProduction = allActive.filter(
    (o) => o.fulfillment_status === "in_production"
  );
  const shipped = allActive.filter(
    (o) =>
      o.fulfillment_status === "shipped" ||
      o.fulfillment_status === "in_transit"
  );

  const columns: PipelineColumn[] = [
    {
      key: "unfulfilled",
      label: "Unfulfilled",
      icon: Clock,
      color: "text-amber-600",
      orders: unfulfilled,
    },
    {
      key: "in_production",
      label: "In Production",
      icon: Package,
      color: "text-blue-600",
      orders: inProduction,
    },
    {
      key: "shipped",
      label: "Shipped",
      icon: Truck,
      color: "text-purple-600",
      orders: shipped,
    },
    {
      key: "delivered",
      label: "Delivered",
      icon: CheckCircle,
      color: "text-emerald-600",
      orders: delivered,
    },
  ];

  const totalOrders = columns.reduce(
    (sum, col) => sum + col.orders.length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fulfillment</h1>
          <p className="text-muted-foreground">
            Track order production and delivery status.
          </p>
        </div>
        <Badge variant="outline">{totalOrders} active orders</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <col.icon className={`size-4 ${col.color}`} />
              <h2 className="font-semibold">{col.label}</h2>
              <Badge variant="secondary" className="ml-auto text-xs">
                {col.orders.length}
              </Badge>
            </div>

            {col.orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        href={`/app/orders/${order.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        #{order.platform_order_number ?? order.id.slice(0, 8)}
                      </Link>
                    </div>
                    {order.platform && (
                      <PlatformBadge
                        platform={order.platform as Platform}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {formatCents(order.total_cents ?? 0)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.ordered_at
                        ? formatRelativeTime(order.ordered_at)
                        : ""}
                    </span>
                  </div>
                  {order.tracking_number && (
                    <div className="mt-2">
                      {order.tracking_url ? (
                        <a
                          href={order.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          {order.tracking_number}
                        </a>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">
                          {order.tracking_number}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {col.orders.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                  No orders
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
