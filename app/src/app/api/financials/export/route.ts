import { createClient } from "@/lib/supabase/server";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check plan for financials feature
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "financials")) {
    return NextResponse.json(
      { error: "Plan does not include financials" },
      { status: 403 },
    );
  }

  // Parse date range from query params (default: last 30 days)
  const searchParams = request.nextUrl.searchParams;

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const from = searchParams.get("from") ?? thirtyDaysAgo.toISOString().split("T")[0];
  const to = searchParams.get("to") ?? now.toISOString().split("T")[0];

  // Query daily_financials for the date range
  const { data: rows, error } = await supabase
    .from("daily_financials")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch financial data" },
      { status: 500 },
    );
  }

  // Helper: convert cents to dollar string with 2 decimal places
  const toDollars = (cents: number | null) =>
    ((cents ?? 0) / 100).toFixed(2);

  // Build CSV
  const headers = [
    "Date",
    "Platform",
    "Orders",
    "Gross Revenue",
    "Shipping Revenue",
    "Tax",
    "Discounts",
    "COGS",
    "Platform Fees",
    "Transaction Fees",
    "Processing Fees",
    "Listing Fees",
    "Shipping Cost",
    "Net Revenue",
    "Profit",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows ?? []) {
    csvRows.push(
      [
        row.date,
        row.platform ?? "",
        row.order_count ?? 0,
        toDollars(row.gross_revenue_cents),
        toDollars(row.shipping_revenue_cents),
        toDollars(row.tax_collected_cents),
        toDollars(row.discount_cents),
        toDollars(row.cogs_cents),
        toDollars(row.platform_fee_cents),
        toDollars(row.transaction_fee_cents),
        toDollars(row.payment_processing_fee_cents),
        toDollars(row.listing_fee_cents),
        toDollars(row.shipping_cost_cents),
        toDollars(row.net_revenue_cents),
        toDollars(row.profit_cents),
      ].join(","),
    );
  }

  const csv = csvRows.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="financials-${from}-${to}.csv"`,
    },
  });
}
