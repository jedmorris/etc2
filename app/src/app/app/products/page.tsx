import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { Download, ImageIcon, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents, formatNumber } from "@/lib/utils/format";
import { PlatformBadge } from "@/components/layout/PlatformBadge";
import { ProductFilters } from "./product-filters";

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-green-600 text-white hover:bg-green-600/90",
  inactive: "bg-gray-500 text-white hover:bg-gray-500/90",
  draft: "bg-yellow-500 text-white hover:bg-yellow-500/90",
};

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Count query
  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (q) countQuery = countQuery.ilike("title", `%${q}%`);
  if (status && status !== "all") countQuery = countQuery.eq("status", status);
  const { count: totalCount } = await countQuery;
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build query
  let query = supabase
    .from("products")
    .select("*")
    .eq("user_id", user.id)
    .order("total_sales", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("title", `%${q}%`);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data: products, error } = await query;

  if (error) {
    console.error("Failed to fetch products:", error);
  }

  const productList = products ?? [];

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/app/products${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            All products across your connected stores.
          </p>
        </div>
        <a href="/api/products/export" download>
          <Button variant="outline" size="sm">
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </a>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Product Catalog</CardTitle>
              <CardDescription>
                {total} product{total !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <ProductFilters currentQuery={q} currentStatus={status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Favorites</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productList.map((product) => {
                const platforms: Array<"etsy" | "shopify" | "printify"> = [];
                if (product.etsy_listing_id) platforms.push("etsy");
                if (product.shopify_product_id) platforms.push("shopify");
                if (product.printify_product_id) platforms.push("printify");

                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/app/products/${product.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt={product.title}
                              className="size-10 rounded-md object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-medium">{product.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_BADGE_CLASS[product.status] ?? ""}
                      >
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {platforms.map((p) => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(product.price_cents ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.total_sales ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(product.total_revenue_cents ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.total_views ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.total_favorites ?? 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {productList.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="size-8" />
                      <p className="text-sm font-medium">No products found</p>
                      <p className="text-xs">
                        {q || status
                          ? "Try adjusting your search or filters."
                          : "Products will appear here after your first sync."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageUrl(page - 1)}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageUrl(page + 1)}
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
