import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PLANS, type PlanId } from "@/lib/stripe/plans"

const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro"]

const PLAN_DISPLAY: Record<
  PlanId,
  { description: string; features: string[]; cta: string; highlighted?: boolean }
> = {
  free: {
    description: "Try it out with your first 50 orders.",
    features: [
      "Dashboard overview",
      "Basic KPIs",
      "Order list",
      "30-day history",
      "30-min sync interval",
    ],
    cta: "Get Started",
  },
  starter: {
    description: "For sellers getting serious about margins.",
    features: [
      "Everything in Free",
      "Financial reports",
      "Product analytics",
      "CSV export",
      "90-day history",
      "15-min sync interval",
    ],
    cta: "Start Starter",
  },
  growth: {
    description: "For growing shops that need the full picture.",
    features: [
      "Everything in Starter",
      "Customer CRM",
      "RFM segmentation",
      "Bestseller analytics",
      "Fulfillment tracking",
      "Webhook notifications",
      "Unlimited history",
      "5-min sync interval",
    ],
    cta: "Start Growth",
    highlighted: true,
  },
  pro: {
    description: "For high-volume sellers who need it all.",
    features: [
      "Everything in Growth",
      "All current & future features",
      "Priority support",
      "5,000 orders/mo",
      "2-min sync interval",
    ],
    cta: "Start Pro",
  },
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free"
  return `$${(cents / 100).toFixed(0)}`
}

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-3 text-muted-foreground text-lg">
          Start free. Upgrade as you grow.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId]
          const display = PLAN_DISPLAY[planId]

          return (
            <Card
              key={planId}
              className={cn(
                "relative flex flex-col",
                display.highlighted && "border-primary shadow-md"
              )}
            >
              {display.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}

              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{display.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    {formatPrice(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground text-sm ml-1">
                      /month
                    </span>
                  )}
                  <p className="text-muted-foreground text-xs mt-1">
                    Up to {plan.maxOrders.toLocaleString()} orders/mo
                  </p>
                </div>

                <ul className="space-y-2">
                  {display.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="size-4 text-primary mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  asChild
                  variant={display.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href={planId === "free" ? "/signup" : `/signup?plan=${planId}`}>
                    {display.cta}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
