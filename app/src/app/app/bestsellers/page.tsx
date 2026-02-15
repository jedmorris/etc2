import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Star, TrendingUp, Zap, Target } from "lucide-react";
import { formatCents, formatPercent } from "@/lib/utils/format";
import { type PlanId } from "@/lib/stripe/plans";
import { FeatureGate } from "@/components/FeatureGate";
import { ProductProfitChart } from "@/components/dashboard/ProductProfitChart";

interface BestsellerCandidate {
  id: string;
  pipeline_stage: string;
  score: number;
  sales_velocity: number | null;
  margin_pct: number | null;
  products: {
    id: string;
    title: string;
    image_url: string | null;
    price_cents: number | null;
    total_sales: number | null;
  } | null;
}

const STAGE_CONFIG: Record<
  string,
  { label: string; description: string; icon: typeof Star }
> = {
  top_performer: {
    label: "Top Performers",
    description: "Your best-selling products with proven demand",
    icon: Star,
  },
  strong: {
    label: "Strong Sellers",
    description: "Consistently good performance and sales",
    icon: TrendingUp,
  },
  promising: {
    label: "Promising",
    description: "Growing momentum, worth investing in",
    icon: Zap,
  },
  candidate: {
    label: "Candidates",
    description: "Potential bestsellers that need more data",
    icon: Target,
  },
};

const STAGE_ORDER = ["top_performer", "strong", "promising", "candidate"];

export default async function BestsellersPage() {
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

  const { data: candidates } = await supabase
    .from("bestseller_candidates")
    .select("*")
    .eq("user_id", user.id)
    .order("score", { ascending: false });

  const candidateList = candidates ?? [];

  // Fetch associated products
  const productIds = candidateList.map((c) => c.product_id).filter(Boolean);
  const { data: products } = productIds.length > 0
    ? await supabase
        .from("products")
        .select("id, title, image_url, price_cents, total_sales")
        .in("id", productIds)
    : { data: [] };

  const productMap = new Map(
    (products ?? []).map((p) => [p.id, p])
  );

  // Fetch total revenue per product from order_line_items
  const revenueMap = new Map<string, number>();
  if (productIds.length > 0) {
    // Paginate to handle large datasets
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: lineItems } = await supabase
        .from("order_line_items")
        .select("product_id, total_cents")
        .eq("user_id", user.id)
        .in("product_id", productIds)
        .range(from, from + pageSize - 1);
      const items = lineItems ?? [];
      for (const li of items) {
        if (li.product_id) {
          revenueMap.set(
            li.product_id,
            (revenueMap.get(li.product_id) ?? 0) + (li.total_cents ?? 0)
          );
        }
      }
      hasMore = items.length === pageSize;
      from += pageSize;
    }
  }

  const allCandidates: BestsellerCandidate[] = candidateList.map((c) => ({
    ...c,
    products: productMap.get(c.product_id) ?? null,
  }));

  // Group by pipeline stage
  const grouped: Record<string, BestsellerCandidate[]> = {};
  for (const stage of STAGE_ORDER) {
    grouped[stage] = [];
  }
  for (const candidate of allCandidates) {
    const stage = candidate.pipeline_stage;
    if (grouped[stage]) {
      grouped[stage].push(candidate);
    } else {
      // Unknown stage -- put in candidates
      grouped["candidate"].push(candidate);
    }
  }

  if (allCandidates.length === 0) {
    return (
      <FeatureGate feature="bestsellers" plan={plan} featureLabel="Bestseller Pipeline" requiredPlan="Growth">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bestseller Pipeline
          </h1>
          <p className="text-muted-foreground">
            Track product performance and identify your next bestsellers.
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex h-40 items-center justify-center text-muted-foreground">
            No bestseller data yet. Data appears after your nightly analytics
            run.
          </CardContent>
        </Card>
      </div>
      </FeatureGate>
    );
  }

  // Build scatter chart data from top 20 candidates
  const scatterData = allCandidates
    .filter(
      (c) =>
        c.sales_velocity != null &&
        c.margin_pct != null &&
        c.products != null
    )
    .slice(0, 20)
    .map((c) => ({
      name: c.products!.title,
      salesVelocity: c.sales_velocity!,
      marginPct: c.margin_pct!,
      totalRevenue: revenueMap.get(c.products!.id) ?? 0,
    }));

  return (
    <FeatureGate feature="bestsellers" plan={plan} featureLabel="Bestseller Pipeline" requiredPlan="Growth">
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bestseller Pipeline
        </h1>
        <p className="text-muted-foreground">
          Track product performance and identify your next bestsellers.
        </p>
      </div>

      {scatterData.length > 0 && <ProductProfitChart data={scatterData} />}

      {STAGE_ORDER.map((stageKey) => {
        const config = STAGE_CONFIG[stageKey];
        const items = grouped[stageKey];
        const Icon = config.icon;

        return (
          <div key={stageKey} className="space-y-4">
            <div className="flex items-center gap-2">
              <Icon className="size-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">{config.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {config.description}
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">
                {items.length}
              </Badge>
            </div>

            {items.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                  No products in this stage
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((candidate) => {
                  const product = candidate.products;
                  return (
                    <Card key={candidate.id}>
                      {product?.image_url && (
                        <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
                          <Image
                            src={product.image_url}
                            alt={product?.title ?? "Product"}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          />
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        {product ? (
                          <Link
                            href={`/app/products/${product.id}`}
                            className="font-medium hover:underline line-clamp-2"
                          >
                            {product.title}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            Unknown product
                          </span>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Score</span>
                          <Badge variant="secondary">
                            {candidate.score.toFixed(1)}
                          </Badge>
                        </div>
                        {candidate.sales_velocity != null && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Sales Velocity
                            </span>
                            <span className="font-medium">
                              {candidate.sales_velocity.toFixed(1)}/day
                            </span>
                          </div>
                        )}
                        {candidate.margin_pct != null && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Margin
                            </span>
                            <span className="font-medium">
                              {formatPercent(candidate.margin_pct)}
                            </span>
                          </div>
                        )}
                        {product?.price_cents != null && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Price
                            </span>
                            <span className="font-medium">
                              {formatCents(product.price_cents)}
                            </span>
                          </div>
                        )}
                        {product && revenueMap.has(product.id) && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Revenue
                            </span>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              {formatCents(revenueMap.get(product.id)!)}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
    </FeatureGate>
  );
}
