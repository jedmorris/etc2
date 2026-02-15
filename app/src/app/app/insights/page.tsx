import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
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
  Lock,
  Crown,
  Heart,
  AlertTriangle,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  BarChart3,
} from "lucide-react";
import { formatCents, formatPercent, formatDate } from "@/lib/utils/format";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PlatformProfitChart } from "@/components/dashboard/PlatformProfitChart";

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Insights Dashboard</CardTitle>
          <CardDescription>
            Advanced analytics and customer insights require the Growth plan or
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

const RFM_COLORS: Record<string, string> = {
  champion:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  loyal: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  at_risk:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  needs_attention:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
};

function rfmLabel(segment: string): string {
  return segment
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "insights")) {
    return <UpgradePrompt />;
  }

  // Fetch all data in parallel
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [customersResult, monthlyCurrentResult, monthlyPrevResult, monthlyAllResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, full_name, email, rfm_segment, total_spent_cents, last_order_at, order_count"
        )
        .eq("user_id", user.id),
      supabase
        .from("monthly_pnl")
        .select("*")
        .eq("user_id", user.id)
        .eq("year", currentYear)
        .eq("month", currentMonth),
      supabase
        .from("monthly_pnl")
        .select("*")
        .eq("user_id", user.id)
        .eq("year", prevYear)
        .eq("month", prevMonth),
      // Last 6 months for platform profitability
      supabase
        .from("monthly_pnl")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(100),
    ]);

  const customers = customersResult.data ?? [];
  const currentMonthPnl = monthlyCurrentResult.data ?? [];
  const prevMonthPnl = monthlyPrevResult.data ?? [];
  const allMonthlyPnl = monthlyAllResult.data ?? [];

  // --- CLV by Segment ---
  const segmentGroups: Record<string, { total: number; count: number }> = {};
  let allTotal = 0;
  let allCount = 0;

  for (const c of customers) {
    const seg = c.rfm_segment ?? "unknown";
    const spent = c.total_spent_cents ?? 0;
    if (!segmentGroups[seg]) segmentGroups[seg] = { total: 0, count: 0 };
    segmentGroups[seg].total += spent;
    segmentGroups[seg].count += 1;
    allTotal += spent;
    allCount += 1;
  }

  const champAvg = segmentGroups["champion"]
    ? Math.round(segmentGroups["champion"].total / segmentGroups["champion"].count)
    : 0;
  const loyalAvg = segmentGroups["loyal"]
    ? Math.round(segmentGroups["loyal"].total / segmentGroups["loyal"].count)
    : 0;
  const atRiskAvg = segmentGroups["at_risk"]
    ? Math.round(segmentGroups["at_risk"].total / segmentGroups["at_risk"].count)
    : 0;
  const overallAvg = allCount > 0 ? Math.round(allTotal / allCount) : 0;

  // --- Platform Profitability (last 6 months aggregated) ---
  // Filter to last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthYear = sixMonthsAgo.getFullYear();
  const sixMonthMonth = sixMonthsAgo.getMonth() + 1;

  const recentPnl = allMonthlyPnl.filter((r) => {
    if (r.year > sixMonthYear) return true;
    if (r.year === sixMonthYear && r.month >= sixMonthMonth) return true;
    return false;
  });

  const platformAgg: Record<
    string,
    { revenue: number; profit: number }
  > = {};
  for (const row of recentPnl) {
    const p = row.platform ?? "unknown";
    if (!platformAgg[p]) platformAgg[p] = { revenue: 0, profit: 0 };
    platformAgg[p].revenue += row.gross_revenue_cents ?? 0;
    platformAgg[p].profit += row.profit_cents ?? 0;
  }

  const platformProfitData = Object.entries(platformAgg)
    .map(([platform, agg]) => ({
      platform,
      marginPct:
        agg.revenue > 0
          ? Number(((agg.profit / agg.revenue) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.marginPct - a.marginPct);

  // --- MoM Growth Rates ---
  const currentTotals = currentMonthPnl.reduce(
    (acc, r) => ({
      revenue: acc.revenue + (r.gross_revenue_cents ?? 0),
      orders: acc.orders + (r.order_count ?? 0),
      profit: acc.profit + (r.profit_cents ?? 0),
    }),
    { revenue: 0, orders: 0, profit: 0 }
  );

  const prevTotals = prevMonthPnl.reduce(
    (acc, r) => ({
      revenue: acc.revenue + (r.gross_revenue_cents ?? 0),
      orders: acc.orders + (r.order_count ?? 0),
      profit: acc.profit + (r.profit_cents ?? 0),
    }),
    { revenue: 0, orders: 0, profit: 0 }
  );

  function growthPct(current: number, previous: number): number | undefined {
    if (previous === 0) return current > 0 ? 100 : undefined;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  const revenueGrowth = growthPct(currentTotals.revenue, prevTotals.revenue);
  const orderGrowth = growthPct(currentTotals.orders, prevTotals.orders);
  const profitGrowth = growthPct(currentTotals.profit, prevTotals.profit);

  // --- At-Risk Alerts ---
  const atRiskCustomers = customers
    .filter(
      (c) => c.rfm_segment === "at_risk" || c.rfm_segment === "needs_attention"
    )
    .sort((a, b) => (b.total_spent_cents ?? 0) - (a.total_spent_cents ?? 0))
    .slice(0, 10);

  const hasData = customers.length > 0 || allMonthlyPnl.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground">
            Advanced analytics and customer intelligence.
          </p>
        </div>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <BarChart3 className="size-12" />
            <div>
              <p className="text-sm font-medium">No data yet</p>
              <p className="text-xs">
                Data appears after your first sync and compute run.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="text-muted-foreground">
          Advanced analytics and customer intelligence.
        </p>
      </div>

      {/* CLV by Segment */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Customer Lifetime Value by Segment</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Champions Avg CLV"
            value={formatCents(champAvg)}
            icon={Crown}
          />
          <KpiCard
            title="Loyal Avg CLV"
            value={formatCents(loyalAvg)}
            icon={Heart}
          />
          <KpiCard
            title="At-Risk Avg CLV"
            value={formatCents(atRiskAvg)}
            icon={AlertTriangle}
          />
          <KpiCard
            title="All Customers Avg CLV"
            value={formatCents(overallAvg)}
            icon={Users}
          />
        </div>
      </div>

      {/* Platform Profitability */}
      {platformProfitData.length > 0 && (
        <PlatformProfitChart data={platformProfitData} />
      )}

      {/* MoM Growth Rates */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Month-over-Month Growth</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Revenue Growth"
            value={formatCents(currentTotals.revenue)}
            change={revenueGrowth}
            changeLabel="vs last month"
            icon={DollarSign}
          />
          <KpiCard
            title="Order Growth"
            value={String(currentTotals.orders)}
            change={orderGrowth}
            changeLabel="vs last month"
            icon={ShoppingCart}
          />
          <KpiCard
            title="Profit Growth"
            value={formatCents(currentTotals.profit)}
            change={profitGrowth}
            changeLabel="vs last month"
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* At-Risk Alerts */}
      {atRiskCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              At-Risk Customers
            </CardTitle>
            <CardDescription>
              Customers who may be churning — consider re-engagement campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Last Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atRiskCustomers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/app/customers/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.full_name || c.email || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={RFM_COLORS[c.rfm_segment ?? ""] ?? ""}
                      >
                        {rfmLabel(c.rfm_segment ?? "unknown")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(c.total_spent_cents ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.order_count ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.last_order_at ? formatDate(c.last_order_at) : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
