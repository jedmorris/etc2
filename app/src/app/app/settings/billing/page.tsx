"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  CreditCard,
  ArrowUpRight,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { PLANS, OVERAGE_RATE_CENTS, type PlanId } from "@/lib/stripe/plans";
import { formatCents, formatNumber, formatDate } from "@/lib/utils/format";

interface Profile {
  plan: string;
  plan_status: string;
  monthly_order_count: number;
  monthly_order_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  url: string | null;
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const PLAN_IDS: PlanId[] = ["free", "starter", "growth", "pro"];

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const showSuccess = searchParams.get("success") === "true";
  const showCancelled = searchParams.get("cancelled") === "true";

  const fetchData = useCallback(async () => {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select(
        "plan, plan_status, monthly_order_count, monthly_order_limit, stripe_customer_id, stripe_subscription_id"
      )
      .eq("user_id", user.id)
      .single();

    setProfile(data);

    // Fetch invoices
    if (data?.stripe_customer_id) {
      try {
        const res = await fetch("/api/billing/invoices");
        if (res.ok) {
          const invoiceData = await res.json();
          setInvoices(invoiceData.invoices ?? []);
        }
      } catch {
        // Invoices are non-critical
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentPlanId = (profile?.plan ?? "free") as PlanId;
  const currentPlan = PLANS[currentPlanId];
  const monthlyOrderCount = profile?.monthly_order_count ?? 0;
  const monthlyOrderLimit = profile?.monthly_order_limit ?? currentPlan.maxOrders;
  const usagePercent = Math.min(
    (monthlyOrderCount / monthlyOrderLimit) * 100,
    100
  );
  const overageCount = Math.max(0, monthlyOrderCount - monthlyOrderLimit);
  const overageCost = overageCount * OVERAGE_RATE_CENTS;

  async function handleUpgrade(planId: PlanId) {
    if (planId === currentPlanId) return;

    setUpgrading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!res.ok) throw new Error("Failed to create checkout");

      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setUpgrading(null);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to open portal");

      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {/* Success/Cancelled alerts */}
      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
          <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
          <span className="text-green-800 dark:text-green-300">
            Your subscription has been updated successfully.
          </span>
        </div>
      )}

      {showCancelled && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-800 dark:text-amber-300">
            Checkout was cancelled. Your plan has not changed.
          </span>
        </div>
      )}

      {/* Past due warning */}
      {profile?.plan_status === "past_due" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-300">
            Your payment is past due. Please update your payment method to avoid
            service interruption.
          </span>
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                You are on the{" "}
                <span className="font-semibold text-foreground">
                  {currentPlan.name}
                </span>{" "}
                plan
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">
                {currentPlan.price === 0
                  ? "Free"
                  : formatCents(currentPlan.price)}
              </p>
              {currentPlan.price > 0 && (
                <p className="text-sm text-muted-foreground">/month</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Usage Meter */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Monthly Order Usage
              </span>
              <span className="font-medium">
                {formatNumber(monthlyOrderCount)} /{" "}
                {formatNumber(monthlyOrderLimit)}
              </span>
            </div>
            <Progress value={usagePercent} />
            {usagePercent >= 80 && usagePercent < 100 && (
              <p className="text-xs text-amber-600">
                You are approaching your monthly order limit. Consider
                upgrading.
              </p>
            )}
            {overageCount > 0 && (
              <p className="text-xs text-red-600">
                You have {formatNumber(overageCount)} orders over your limit.
                Overage: {formatCents(overageCost)} (
                {formatCents(OVERAGE_RATE_CENTS)}/order).
              </p>
            )}
          </div>

          {/* Plan details */}
          <div className="grid grid-cols-3 gap-4 rounded-lg border p-3 text-sm">
            <div>
              <p className="text-muted-foreground">Sync frequency</p>
              <p className="font-medium">
                Every {currentPlan.syncIntervalMin} min
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">History</p>
              <p className="font-medium">
                {currentPlan.historyDays === -1
                  ? "Unlimited"
                  : `${currentPlan.historyDays} days`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Orders included</p>
              <p className="font-medium">
                {formatNumber(currentPlan.maxOrders)}/mo
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          {currentPlanId !== "pro" && (
            <Button
              className="gap-1"
              onClick={() => {
                // Find next tier
                const currentIdx = PLAN_IDS.indexOf(currentPlanId);
                const nextPlan = PLAN_IDS[currentIdx + 1];
                if (nextPlan) handleUpgrade(nextPlan);
              }}
              disabled={!!upgrading}
            >
              <ArrowUpRight className="size-3" />
              Upgrade Plan
            </Button>
          )}
          {profile?.stripe_customer_id && (
            <Button
              variant="outline"
              className="gap-1"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CreditCard className="size-3" />
              )}
              Manage Billing
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Plan Comparison */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_IDS.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = planId === currentPlanId;
          const isPopular = planId === "growth";
          const currentIdx = PLAN_IDS.indexOf(currentPlanId);
          const planIdx = PLAN_IDS.indexOf(planId);
          const isUpgrade = planIdx > currentIdx;
          const isDowngrade = planIdx < currentIdx;
          const isLoading = upgrading === planId;

          return (
            <Card
              key={planId}
              className={
                isCurrent
                  ? "border-primary ring-2 ring-primary/20"
                  : isPopular
                    ? "border-primary/50"
                    : ""
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                  {isPopular && !isCurrent && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Sparkles className="size-3" />
                      Popular
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-2xl font-bold">
                    {plan.price === 0 ? "Free" : formatCents(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-sm text-muted-foreground">/mo</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-primary" />
                  {formatNumber(plan.maxOrders)} orders/month
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-primary" />
                  Sync every {plan.syncIntervalMin} min
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-primary" />
                  {plan.historyDays === -1
                    ? "Full history"
                    : `${plan.historyDays}-day history`}
                </div>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => handleUpgrade(planId)}
                    disabled={!!upgrading}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Upgrade
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    Downgrade
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>
            Your past invoices and payment receipts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!profile?.stripe_customer_id ? (
            <p className="text-sm text-muted-foreground">
              No invoices yet. Upgrade to a paid plan to see billing history.
            </p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices found.
            </p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {formatDate(invoice.date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatCents(invoice.amount)}
                    </span>
                    <Badge
                      variant={
                        invoice.status === "paid" ? "default" : "secondary"
                      }
                      className="capitalize"
                    >
                      {invoice.status}
                    </Badge>
                    {invoice.url && (
                      <a
                        href={invoice.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
