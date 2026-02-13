import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ImageIcon,
  Eye,
  Heart,
  ShoppingCart,
  DollarSign,
} from "lucide-react";
import { formatCents, formatNumber } from "@/lib/utils/format";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PlatformBadge } from "@/components/layout/PlatformBadge";

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-green-600 text-white hover:bg-green-600/90",
  inactive: "bg-gray-500 text-white hover:bg-gray-500/90",
  draft: "bg-yellow-500 text-white hover:bg-yellow-500/90",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !product) {
    notFound();
  }

  // Determine connected platforms
  const platforms: Array<"etsy" | "shopify" | "printify"> = [];
  if (product.etsy_listing_id) platforms.push("etsy");
  if (product.shopify_product_id) platforms.push("shopify");
  if (product.printify_product_id) platforms.push("printify");

  // Parse tags — could be stored as string[] or JSON
  const tags: string[] = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === "string"
      ? JSON.parse(product.tags)
      : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/app/products">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {product.title}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            {platforms.map((p) => (
              <PlatformBadge key={p} platform={p} />
            ))}
            <Badge className={STATUS_BADGE_CLASS[product.status] ?? ""}>
              {product.status}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">
            {formatCents(product.price_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">listing price</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Sales"
          value={formatNumber(product.total_sales ?? 0)}
          icon={ShoppingCart}
        />
        <KpiCard
          title="Revenue"
          value={formatCents(product.total_revenue_cents ?? 0)}
          icon={DollarSign}
        />
        <KpiCard
          title="Views"
          value={formatNumber(product.total_views ?? 0)}
          icon={Eye}
        />
        <KpiCard
          title="Favorites"
          value={formatNumber(product.total_favorites ?? 0)}
          icon={Heart}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Product Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product image */}
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.title}
                className="size-48 rounded-lg object-cover"
              />
            ) : (
              <div className="flex size-48 items-center justify-center rounded-lg border bg-muted">
                <ImageIcon className="size-12 text-muted-foreground" />
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="text-sm font-medium">Description</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {product.description}
                </p>
              </div>
            )}

            {/* Price & COGS */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Price</h3>
                <p className="mt-1 text-lg font-semibold">
                  {formatCents(product.price_cents ?? 0)}
                </p>
              </div>
              {product.printify_production_cost_cents != null && (
                <div>
                  <h3 className="text-sm font-medium">COGS (Production)</h3>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCents(product.printify_production_cost_cents)}
                  </p>
                  {product.price_cents != null && product.price_cents > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {(
                        ((product.price_cents - product.printify_production_cost_cents) /
                          product.price_cents) *
                        100
                      ).toFixed(1)}
                      % margin
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Tags</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Links & Stats */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform IDs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {product.etsy_listing_id && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Etsy Listing</span>
                  <span className="font-mono text-xs">
                    {product.etsy_listing_id}
                  </span>
                </div>
              )}
              {product.shopify_product_id && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Shopify Product</span>
                  <span className="font-mono text-xs">
                    {product.shopify_product_id}
                  </span>
                </div>
              )}
              {product.printify_product_id && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Printify Product</span>
                  <span className="font-mono text-xs">
                    {product.printify_product_id}
                  </span>
                </div>
              )}
              {platforms.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No platform IDs linked yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Views to Sales</span>
                <span className="font-medium">
                  {(product.total_views ?? 0) > 0
                    ? (
                        ((product.total_sales ?? 0) /
                          (product.total_views ?? 1)) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Views to Favorites</span>
                <span className="font-medium">
                  {(product.total_views ?? 0) > 0
                    ? (
                        ((product.total_favorites ?? 0) /
                          (product.total_views ?? 1)) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg. Order Value</span>
                <span className="font-medium">
                  {(product.total_sales ?? 0) > 0
                    ? formatCents(
                        Math.round(
                          (product.total_revenue_cents ?? 0) /
                            (product.total_sales ?? 1)
                        )
                      )
                    : "$0.00"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
