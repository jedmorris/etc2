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

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const plan = (profile?.plan ?? "free") as PlanId;

  if (!hasFeature(plan, "csv_export")) {
    return NextResponse.json(
      { error: "Plan does not include CSV export" },
      { status: 403 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const toDollars = (cents: number | null) =>
    ((cents ?? 0) / 100).toFixed(2);

  let query = supabase
    .from("orders")
    .select(
      "platform_order_number, platform, status, fulfillment_status, subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents, profit_cents, ordered_at"
    )
    .eq("user_id", user.id)
    .order("ordered_at", { ascending: false });

  if (fromParam && dateRegex.test(fromParam)) {
    query = query.gte("ordered_at", fromParam);
  }
  if (toParam && dateRegex.test(toParam)) {
    query = query.lte("ordered_at", toParam + "T23:59:59.999Z");
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "No orders found for the selected date range" },
      { status: 404 },
    );
  }

  const headers = [
    "Order #",
    "Platform",
    "Status",
    "Fulfillment",
    "Subtotal",
    "Shipping",
    "Tax",
    "Discount",
    "Total",
    "Profit",
    "Ordered At",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows) {
    csvRows.push(
      [
        row.platform_order_number ?? "",
        row.platform ?? "",
        row.status ?? "",
        row.fulfillment_status ?? "",
        toDollars(row.subtotal_cents),
        toDollars(row.shipping_cents),
        toDollars(row.tax_cents),
        toDollars(row.discount_cents),
        toDollars(row.total_cents),
        toDollars(row.profit_cents),
        row.ordered_at ?? "",
      ].join(","),
    );
  }

  const csv = csvRows.join("\n");
  const fromLabel = fromParam && dateRegex.test(fromParam) ? fromParam : "all";
  const toLabel = toParam && dateRegex.test(toParam) ? toParam : "now";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="orders-${fromLabel}-${toLabel}.csv"`,
    },
  });
}
