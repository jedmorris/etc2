import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Lock, Users } from "lucide-react";
import {
  formatCents,
  formatNumber,
  formatRelativeTime,
} from "@/lib/utils/format";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { RfmSegmentChart } from "@/components/dashboard/RfmSegmentChart";

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

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
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
    .maybeSingle();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "crm")) {
    return <UpgradePrompt />;
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { count: totalCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .order("total_spent_cents", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const customerList = customers ?? [];

  // Aggregate RFM segments for chart
  const { data: allCustomerSegments } = await supabase
    .from("customers")
    .select("rfm_segment")
    .eq("user_id", user.id)
    .not("rfm_segment", "is", null)

  const segmentCounts = new Map<string, number>()
  for (const c of allCustomerSegments ?? []) {
    if (c.rfm_segment) {
      segmentCounts.set(c.rfm_segment, (segmentCounts.get(c.rfm_segment) ?? 0) + 1)
    }
  }
  const rfmChartData = Array.from(segmentCounts.entries())
    .map(([segment, count]) => ({ segment, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Customer insights with RFM segmentation.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" />
          {formatNumber(total)} total
        </div>
      </div>

      {rfmChartData.length > 0 && (
        <RfmSegmentChart data={rfmChartData} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>
            Customers ranked by total spent. Segments auto-calculated from RFM
            analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customerList.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              No customers yet. Customers will appear after your first order
              sync.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead>RFM Segment</TableHead>
                  <TableHead>Last Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerList.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/app/customers/${customer.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.full_name || customer.email}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.email}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(customer.order_count ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(customer.total_spent_cents ?? 0)}
                    </TableCell>
                    <TableCell>
                      <RfmBadge segment={customer.rfm_segment} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.last_order_at
                        ? formatRelativeTime(customer.last_order_at)
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/app/customers${page > 2 ? `?page=${page - 1}` : ""}`}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/app/customers?page=${page + 1}`}
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
  );
}
