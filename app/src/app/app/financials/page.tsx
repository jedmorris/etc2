import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { Button } from "@/components/ui/button";
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
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Lock,
  BarChart3,
  Download,
} from "lucide-react";
import { formatCents, formatPercent } from "@/lib/utils/format";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Financial Reports</CardTitle>
          <CardDescription>
            P&L reports, fee breakdowns, and revenue analysis require the Starter
            plan or above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/settings/billing">
            <Button>Upgrade to Starter</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
        <BarChart3 className="size-12" />
        <div>
          <p className="text-sm font-medium">No financial data yet</p>
          <p className="text-xs">
            Data appears after your first sync.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function FinancialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check plan for feature gate
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "financials")) {
    return <UpgradePrompt />;
  }

  // Calculate date range: last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  // Current month boundaries
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  // Fetch daily financials for last 30 days and monthly P&L in parallel
  const [dailyResult, monthlyResult] = await Promise.all([
    supabase
      .from("daily_financials")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", thirtyDaysAgoStr)
      .order("date", { ascending: true }),
    supabase
      .from("monthly_pnl")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", currentYear)
      .eq("month", currentMonth),
  ]);

  const dailyData = dailyResult.data ?? [];
  const monthlyData = monthlyResult.data ?? [];

  // If no data at all, show empty state
  if (dailyData.length === 0 && monthlyData.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground">
            Profit &amp; loss overview for your business.
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  // Aggregate daily data for KPI cards
  const aggregated = dailyData.reduce(
    (acc, day) => ({
      grossRevenueCents: acc.grossRevenueCents + (day.gross_revenue_cents ?? 0),
      platformFeeCents: acc.platformFeeCents + (day.platform_fee_cents ?? 0),
      transactionFeeCents: acc.transactionFeeCents + (day.transaction_fee_cents ?? 0),
      processingFeeCents: acc.processingFeeCents + (day.payment_processing_fee_cents ?? 0),
      listingFeeCents: acc.listingFeeCents + (day.listing_fee_cents ?? 0),
      shippingCostCents: acc.shippingCostCents + (day.shipping_cost_cents ?? 0),
      cogsCents: acc.cogsCents + (day.cogs_cents ?? 0),
      profitCents: acc.profitCents + (day.profit_cents ?? 0),
      orderCount: acc.orderCount + (day.order_count ?? 0),
    }),
    {
      grossRevenueCents: 0,
      platformFeeCents: 0,
      transactionFeeCents: 0,
      processingFeeCents: 0,
      listingFeeCents: 0,
      shippingCostCents: 0,
      cogsCents: 0,
      profitCents: 0,
      orderCount: 0,
    }
  );

  const totalFeesCents =
    aggregated.platformFeeCents +
    aggregated.transactionFeeCents +
    aggregated.processingFeeCents +
    aggregated.listingFeeCents;

  const marginPct =
    aggregated.grossRevenueCents > 0
      ? (aggregated.profitCents / aggregated.grossRevenueCents) * 100
      : 0;

  // Build fee breakdown for display
  const feeBreakdown = [
    { label: "Platform Fees", cents: aggregated.platformFeeCents },
    { label: "Transaction Fees", cents: aggregated.transactionFeeCents },
    { label: "Payment Processing", cents: aggregated.processingFeeCents },
    { label: "Listing Fees", cents: aggregated.listingFeeCents },
    { label: "Shipping Costs", cents: aggregated.shippingCostCents },
  ].filter((f) => f.cents > 0);

  // Calculate percentage for each fee
  const feeBreakdownWithPercent = feeBreakdown.map((f) => ({
    ...f,
    percent: totalFeesCents > 0 ? (f.cents / totalFeesCents) * 100 : 0,
  }));

  // Build chart data from daily financials (aggregate across platforms per date)
  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  for (const row of dailyData) {
    const existing = dailyMap.get(row.date);
    if (existing) {
      existing.revenue += row.gross_revenue_cents ?? 0;
      existing.orders += row.order_count ?? 0;
    } else {
      dailyMap.set(row.date, {
        revenue: row.gross_revenue_cents ?? 0,
        orders: row.order_count ?? 0,
      });
    }
  }
  const chartData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, revenue: vals.revenue, orders: vals.orders }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground">
            Profit &amp; loss overview for your business.
          </p>
        </div>
        <a
          href={`/api/financials/export?from=${thirtyDaysAgoStr}&to=${new Date().toISOString().split("T")[0]}`}
          download
        >
          <Button variant="outline" size="sm">
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Gross Revenue"
          value={formatCents(aggregated.grossRevenueCents)}
          icon={DollarSign}
        />
        <KpiCard
          title="Total Fees"
          value={formatCents(totalFeesCents)}
          icon={PieChart}
        />
        <KpiCard
          title="COGS"
          value={formatCents(aggregated.cogsCents)}
          icon={TrendingDown}
        />
        <KpiCard
          title="Net Profit"
          value={formatCents(aggregated.profitCents)}
          change={marginPct}
          changeLabel="margin"
          icon={TrendingUp}
        />
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <RevenueChart data={chartData} title="Revenue (Last 30 Days)" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fee Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Fee Breakdown</CardTitle>
            <CardDescription>
              Where your fees go (last 30 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feeBreakdownWithPercent.length > 0 ? (
              <div className="space-y-4">
                {feeBreakdownWithPercent.map((fee) => (
                  <div key={fee.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{fee.label}</span>
                      <span className="font-medium">
                        {formatCents(fee.cents)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${fee.percent}%` }}
                      />
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {formatPercent(fee.percent)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No fees recorded yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Monthly P&L Table */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly P&L</CardTitle>
            <CardDescription>
              Breakdown by platform for {currentMonthStr}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((row) => (
                      <TableRow key={`${row.platform}-${row.year}-${row.month}`}>
                        <TableCell className="capitalize font-medium">
                          {row.platform ?? "All"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.order_count ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(row.gross_revenue_cents ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(row.total_fees_cents ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(row.cogs_cents ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCents(row.profit_cents ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              (row.margin_pct ?? 0) >= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {formatPercent(row.margin_pct ?? 0)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No monthly P&L data for {currentMonthStr}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
