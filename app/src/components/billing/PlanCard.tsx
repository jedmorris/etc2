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
import type { PlanConfig } from "@/lib/stripe/plans"

interface PlanCardProps {
  plan: PlanConfig
  isCurrentPlan: boolean
  isPopular?: boolean
  features: string[]
  onSelect: () => void
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free"
  return `$${(cents / 100).toFixed(0)}`
}

export function PlanCard({
  plan,
  isCurrentPlan,
  isPopular = false,
  features,
  onSelect,
}: PlanCardProps) {
  return (
    <Card
      className={cn(
        "relative flex flex-col",
        isPopular && "border-primary shadow-md",
        isCurrentPlan && "ring-2 ring-primary"
      )}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}

      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {plan.name}
          {isCurrentPlan && (
            <Badge variant="secondary" className="text-xs">
              Current
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Up to {plan.maxOrders.toLocaleString()} orders/mo
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
          {plan.price > 0 && (
            <span className="text-muted-foreground text-sm ml-1">/month</span>
          )}
        </div>

        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="size-4 text-primary mt-0.5 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          variant={isCurrentPlan ? "outline" : isPopular ? "default" : "outline"}
          className="w-full"
          disabled={isCurrentPlan}
          onClick={onSelect}
        >
          {isCurrentPlan ? "Current Plan" : `Select ${plan.name}`}
        </Button>
      </CardFooter>
    </Card>
  )
}
