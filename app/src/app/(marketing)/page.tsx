import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  DollarSign,
  Users,
  ArrowRight,
  Plug,
  RefreshCw,
  TrendingUp,
  Check,
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Real-Time Dashboard",
    description:
      "See every order, shipment, and sale across Etsy and Shopify in one unified view. No more tab-switching.",
  },
  {
    icon: DollarSign,
    title: "True Profit Tracking",
    description:
      "Automatic fee calculation for platform fees, transaction fees, Printify COGS, and shipping. Know your real margins.",
  },
  {
    icon: Users,
    title: "Smart CRM",
    description:
      "RFM segmentation identifies your best customers automatically. See repeat buyers, high spenders, and at-risk segments.",
  },
];

const steps = [
  {
    icon: Plug,
    step: "1",
    title: "Connect your stores",
    description:
      "Link your Etsy, Shopify, and Printify accounts with one-click OAuth. Takes under 60 seconds.",
  },
  {
    icon: RefreshCw,
    step: "2",
    title: "We sync your data",
    description:
      "Orders, products, customers, and fees are pulled automatically. Historical data backfilled on first sync.",
  },
  {
    icon: TrendingUp,
    step: "3",
    title: "See real numbers",
    description:
      "Your dashboard populates with true profit, fee breakdowns, fulfillment tracking, and customer insights.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For getting started",
    features: [
      "1 connected store",
      "50 orders/month",
      "Basic dashboard",
      "7-day data retention",
    ],
    cta: "Start Free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "For growing sellers",
    features: [
      "2 connected stores",
      "500 orders/month",
      "Full dashboard",
      "P&L reports",
      "90-day data retention",
    ],
    cta: "Start Free Trial",
    href: "/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    description: "For serious sellers",
    features: [
      "5 connected stores",
      "2,000 orders/month",
      "Customer CRM",
      "Bestseller pipeline",
      "Fulfillment tracking",
      "1-year data retention",
    ],
    cta: "Start Free Trial",
    href: "/signup?plan=growth",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For power sellers",
    features: [
      "Unlimited stores",
      "10,000 orders/month",
      "Everything in Growth",
      "API access",
      "Priority support",
      "Unlimited data retention",
    ],
    cta: "Start Free Trial",
    href: "/signup?plan=pro",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Built for Etsy + Printify sellers
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your Etsy POD business,{" "}
              <span className="text-primary">one dashboard</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
              Stop guessing your margins. etC2 connects your Etsy, Shopify, and
              Printify accounts to show true profit after every fee, COGS, and
              shipping cost.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="gap-2">
                  Start Free <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/#features">
                <Button variant="outline" size="lg">
                  See Features
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything you need to run your POD business
            </h2>
            <p className="mt-4 text-muted-foreground">
              Purpose-built analytics for print-on-demand sellers on Etsy and
              Shopify.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-md">
                <CardHeader>
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="size-6 text-primary" />
                  </div>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Up and running in minutes
            </h2>
            <p className="mt-4 text-muted-foreground">
              Three steps to clarity on your POD business.
            </p>
          </div>
          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {step.step}
                </div>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground">
              Start free. Upgrade when you need more.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlight
                    ? "relative border-primary shadow-lg"
                    : "relative"
                }
              >
                {plan.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href={plan.href} className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
