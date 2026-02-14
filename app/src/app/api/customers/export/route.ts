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

  if (!hasFeature(plan, "crm")) {
    return NextResponse.json(
      { error: "Plan does not include CRM" },
      { status: 403 },
    );
  }

  const toDollars = (cents: number | null) =>
    ((cents ?? 0) / 100).toFixed(2);

  const { data: rows, error } = await supabase
    .from("customers")
    .select(
      "full_name, email, order_count, total_spent_cents, average_order_cents, rfm_segment, first_order_at, last_order_at"
    )
    .eq("user_id", user.id)
    .order("total_spent_cents", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "No customers found" },
      { status: 404 },
    );
  }

  const headers = [
    "Name",
    "Email",
    "Orders",
    "Total Spent",
    "Avg Order",
    "RFM Segment",
    "First Order",
    "Last Order",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows) {
    csvRows.push(
      [
        `"${(row.full_name ?? "").replace(/"/g, '""')}"`,
        row.email ?? "",
        row.order_count ?? 0,
        toDollars(row.total_spent_cents),
        toDollars(row.average_order_cents),
        row.rfm_segment ?? "",
        row.first_order_at ?? "",
        row.last_order_at ?? "",
      ].join(","),
    );
  }

  const csv = csvRows.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="customers-export.csv"`,
    },
  });
}
