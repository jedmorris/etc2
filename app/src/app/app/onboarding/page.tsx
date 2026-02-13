"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"
import { ConnectEtsy } from "@/components/onboarding/ConnectEtsy"
import { ConnectPrintify } from "@/components/onboarding/ConnectPrintify"
import { ConnectShopify } from "@/components/onboarding/ConnectShopify"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PLANS, type PlanId } from "@/lib/stripe/plans"
import { CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { formatCents } from "@/lib/utils/format"

type ConnectionStatus = "idle" | "connecting" | "connected" | "error"

interface ConnectionState {
  etsy: { status: ConnectionStatus; shopName?: string; error?: string }
  printify: { status: ConnectionStatus; error?: string }
  shopify: { status: ConnectionStatus; error?: string }
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [connections, setConnections] = useState<ConnectionState>({
    etsy: { status: "idle" },
    printify: { status: "idle" },
    shopify: { status: "idle" },
  })
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null)
  const [completing, setCompleting] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load existing connection state on mount
  useEffect(() => {
    async function loadState() {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }

      // Check existing connections
      const { data: accounts } = await supabase
        .from("connected_accounts")
        .select("platform, platform_shop_name, status")
        .eq("user_id", user.id)

      const newConnections: ConnectionState = {
        etsy: { status: "idle" },
        printify: { status: "idle" },
        shopify: { status: "idle" },
      }

      let maxCompletedStep = 0

      if (accounts) {
        for (const account of accounts) {
          const platform = account.platform as keyof ConnectionState
          if (platform in newConnections && account.status === "connected") {
            newConnections[platform] = {
              status: "connected",
              ...(account.platform_shop_name
                ? { shopName: account.platform_shop_name }
                : {}),
            }
          }
        }
      }

      if (newConnections.etsy.status === "connected") maxCompletedStep = 1
      if (newConnections.printify.status === "connected") maxCompletedStep = 2
      if (newConnections.shopify.status === "connected") maxCompletedStep = 3

      setConnections(newConnections)

      // Check onboarding_step from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_step, onboarding_completed, plan")
        .eq("user_id", user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.push("/app")
        return
      }

      // Determine current step from connections
      const step = maxCompletedStep + 1
      setCurrentStep(Math.min(step, 4))

      if (profile?.plan && profile.plan !== "free") {
        setSelectedPlan(profile.plan as PlanId)
      }

      setLoading(false)
    }

    loadState()
  }, [router])

  // Check for OAuth callback results in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const etsyConnected = params.get("etsy_connected")
    const shopifyConnected = params.get("shopify_connected")
    const checkoutResult = params.get("checkout")
    const error = params.get("error")

    // Handle Stripe checkout return
    if (checkoutResult === "success") {
      // Checkout succeeded - complete onboarding
      completeOnboarding((null as unknown) as PlanId) // plan already set by webhook
      window.history.replaceState({}, "", "/app/onboarding")
      return
    }
    if (checkoutResult === "cancelled") {
      // User cancelled checkout - stay on step 4
      setCurrentStep(4)
      window.history.replaceState({}, "", "/app/onboarding")
      return
    }

    if (etsyConnected === "true") {
      setConnections((prev) => ({
        ...prev,
        etsy: {
          status: "connected",
          shopName: params.get("shop_name") || undefined,
        },
      }))
      setCurrentStep(2)
      // Clean URL
      window.history.replaceState({}, "", "/app/onboarding")
    }

    if (shopifyConnected === "true") {
      setConnections((prev) => ({
        ...prev,
        shopify: { status: "connected" },
      }))
      setCurrentStep(4)
      window.history.replaceState({}, "", "/app/onboarding")
    }

    if (error) {
      const platform = params.get("platform") as keyof ConnectionState | null
      if (platform && platform in connections) {
        setConnections((prev) => ({
          ...prev,
          [platform]: { status: "error", error: decodeURIComponent(error) },
        }))
      }
      window.history.replaceState({}, "", "/app/onboarding")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStepComplete = useCallback((step: number) => {
    setCurrentStep(step + 1)
  }, [])

  async function handlePrintifyConnect(token: string) {
    setConnections((prev) => ({
      ...prev,
      printify: { status: "connecting" },
    }))

    try {
      const res = await fetch("/api/auth/printify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to validate Printify token.")
      }

      setConnections((prev) => ({
        ...prev,
        printify: { status: "connected" },
      }))

      // Auto-advance after short delay
      setTimeout(() => setCurrentStep(3), 500)
    } catch (err) {
      setConnections((prev) => ({
        ...prev,
        printify: {
          status: "error",
          error: err instanceof Error ? err.message : "Connection failed.",
        },
      }))
    }
  }

  function handleEtsyConnect() {
    setConnections((prev) => ({
      ...prev,
      etsy: { status: "connecting" },
    }))
    // Redirect to OAuth - the redirect will handle the rest
    window.location.href = "/api/auth/etsy/connect"
  }

  async function handleShopifyConnect(domain: string) {
    setConnections((prev) => ({
      ...prev,
      shopify: { status: "connecting" },
    }))
    window.location.href = `/api/auth/shopify/connect?shop=${encodeURIComponent(domain)}`
  }

  function handleShopifySkip() {
    setCurrentStep(4)
  }

  async function handleSelectPlan(planId: PlanId) {
    setSelectedPlan(planId)

    if (planId === "free") {
      await completeOnboarding(planId)
      return
    }

    // For paid plans, redirect to Stripe checkout
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, redirectUrl: "/app/onboarding" }),
      })

      if (!res.ok) throw new Error("Failed to create checkout session")

      const { url } = await res.json()
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      console.error("Checkout error:", err)
      setSelectedPlan(null)
    }
  }

  async function completeOnboarding(planId: PlanId | null) {
    setCompleting(true)
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const updates: Record<string, unknown> = {
      onboarding_completed: true,
      onboarding_step: "complete",
    }
    // Only set plan if provided (Stripe webhook may have already set it)
    if (planId) {
      updates.plan = planId
    }

    await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id)

    router.push("/app")
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <OnboardingWizard
      currentStep={currentStep}
      onStepComplete={handleStepComplete}
    >
      {/* Step 1: Connect Etsy */}
      {currentStep === 1 && (
        <ConnectEtsy
          status={connections.etsy.status}
          shopName={connections.etsy.shopName}
          onConnect={handleEtsyConnect}
          errorMessage={connections.etsy.error}
        />
      )}

      {/* Step 2: Connect Printify */}
      {currentStep === 2 && (
        <ConnectPrintify
          status={connections.printify.status}
          onConnect={handlePrintifyConnect}
          errorMessage={connections.printify.error}
        />
      )}

      {/* Step 3: Connect Shopify (optional) */}
      {currentStep === 3 && (
        <ConnectShopify
          status={connections.shopify.status}
          onConnect={handleShopifyConnect}
          onSkip={handleShopifySkip}
          errorMessage={connections.shopify.error}
        />
      )}

      {/* Step 4: Choose Plan */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              Choose your plan
            </h2>
            <p className="mt-1 text-muted-foreground">
              Start free and upgrade as your business grows.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(
              ([id, plan]) => {
                const isSelected = selectedPlan === id
                const isPopular = id === "growth"

                return (
                  <Card
                    key={id}
                    className={
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : isPopular
                          ? "border-primary/50"
                          : ""
                    }
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        {isPopular && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            <Sparkles className="size-3" />
                            Popular
                          </span>
                        )}
                      </div>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">
                          {plan.price === 0
                            ? "Free"
                            : `${formatCents(plan.price)}`}
                        </span>
                        {plan.price > 0 && (
                          <span className="text-muted-foreground">/mo</span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="size-3.5 text-primary" />
                          {plan.maxOrders.toLocaleString()} orders/mo
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="size-3.5 text-primary" />
                          Sync every {plan.syncIntervalMin} min
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="size-3.5 text-primary" />
                          {plan.historyDays === -1
                            ? "Full history"
                            : `${plan.historyDays}-day history`}
                        </li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full"
                        variant={isPopular ? "default" : "outline"}
                        onClick={() => handleSelectPlan(id)}
                        disabled={completing || isSelected}
                      >
                        {completing && isSelected ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Setting up...
                          </>
                        ) : isSelected ? (
                          <>
                            <CheckCircle2 className="mr-2 size-4" />
                            Selected
                          </>
                        ) : id === "free" ? (
                          "Start Free"
                        ) : (
                          `Choose ${plan.name}`
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                )
              }
            )}
          </div>
        </div>
      )}
    </OnboardingWizard>
  )
}
