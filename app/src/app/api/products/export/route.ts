import { createClient } from "@/lib/supabase/server";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";
import { NextResponse } from "next/server";

export async function GET() {
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

  const toDollars = (cents: number | null) =>
    ((cents ?? 0) / 100).toFixed(2);

  const { data: rows, error } = await supabase
    .from("products")
    .select(
      "title, status, etsy_listing_id, shopify_product_id, printify_product_id, price_cents, total_sales, total_revenue_cents, total_views, total_favorites, created_at"
    )
    .eq("user_id", user.id)
    .order("total_sales", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "No products found" },
      { status: 404 },
    );
  }

  const headers = [
    "Title",
    "Status",
    "Platform IDs",
    "Price",
    "Total Sales",
    "Revenue",
    "Views",
    "Favorites",
    "Created At",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const platformIds = [
      row.etsy_listing_id ? `etsy:${row.etsy_listing_id}` : "",
      row.shopify_product_id ? `shopify:${row.shopify_product_id}` : "",
      row.printify_product_id ? `printify:${row.printify_product_id}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    csvRows.push(
      [
        `"${(row.title ?? "").replace(/"/g, '""')}"`,
        row.status ?? "",
        `"${platformIds}"`,
        toDollars(row.price_cents),
        row.total_sales ?? 0,
        toDollars(row.total_revenue_cents),
        row.total_views ?? 0,
        row.total_favorites ?? 0,
        row.created_at ?? "",
      ].join(","),
    );
  }

  const csv = csvRows.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="products-export.csv"`,
    },
  });
}
