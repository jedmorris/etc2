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
import { Check, Minus } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For getting started",
    cta: "Start Free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "For growing sellers",
    cta: "Start Free Trial",
    href: "/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    description: "For serious sellers",
    cta: "Start Free Trial",
    href: "/signup?plan=growth",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For power sellers",
    cta: "Start Free Trial",
    href: "/signup?plan=pro",
    highlight: false,
  },
];

type FeatureValue = boolean | string;

interface ComparisonFeature {
  name: string;
  free: FeatureValue;
  starter: FeatureValue;
  growth: FeatureValue;
  pro: FeatureValue;
}

const comparisonFeatures: ComparisonFeature[] = [
  {
    name: "Connected stores",
    free: "1",
    starter: "2",
    growth: "5",
    pro: "Unlimited",
  },
  {
    name: "Orders/month",
    free: "50",
    starter: "500",
    growth: "2,000",
    pro: "10,000",
  },
  {
    name: "Data retention",
    free: "7 days",
    starter: "90 days",
    growth: "1 year",
    pro: "Unlimited",
  },
  { name: "Dashboard", free: true, starter: true, growth: true, pro: true },
  {
    name: "Order tracking",
    free: true,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    name: "Product analytics",
    free: true,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    name: "P&L reports",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    name: "Fee breakdowns",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    name: "Customer CRM",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    name: "RFM segmentation",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    name: "Bestseller pipeline",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    name: "Fulfillment tracking",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    name: "API access",
    free: false,
    starter: false,
    growth: false,
    pro: true,
  },
  {
    name: "Priority support",
    free: false,
    starter: false,
    growth: false,
    pro: true,
  },
];

const faqs = [
  {
    question: "Can I try etC2 before paying?",
    answer:
      "Yes. The Free plan is free forever with no credit card required. Paid plans also include a 14-day free trial.",
  },
  {
    question: "What platforms do you support?",
    answer:
      "We currently support Etsy, Shopify, and Printify. We connect to each platform via OAuth so your credentials stay secure.",
  },
  {
    question: "How accurate is the profit calculation?",
    answer:
      "We pull actual fee data from each platform including transaction fees, listing fees, payment processing fees, and Printify production costs. No estimates or averages.",
  },
  {
    question: "Can I downgrade or cancel anytime?",
    answer:
      "Yes. You can change plans or cancel from your billing settings at any time. Downgrades take effect at the end of your billing period.",
  },
  {
    question: "What happens if I exceed my order limit?",
    answer:
      "We will notify you when you approach your limit. Existing data stays accessible, but new orders will not sync until you upgrade or the next billing cycle.",
  },
  {
    question: "Is my data secure?",
    answer:
      "All data is encrypted in transit and at rest. OAuth tokens are encrypted with AES-256. We never store your platform passwords.",
  },
];

function FeatureCell({ value }: { value: FeatureValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="size-4 text-primary" />
    ) : (
      <Minus className="size-4 text-muted-foreground/40" />
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="py-24">
      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Pick the plan that fits your business
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            All plans include a 14-day free trial. No credit card required to
            start.
          </p>
        </div>

        {/* Plan Cards */}
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

        {/* Comparison Table */}
        <div className="mt-24">
          <h2 className="mb-8 text-center text-2xl font-bold">
            Full feature comparison
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Feature</th>
                  <th className="px-4 py-3 text-center font-medium">Free</th>
                  <th className="px-4 py-3 text-center font-medium">
                    Starter
                  </th>
                  <th className="px-4 py-3 text-center font-medium">
                    <span className="text-primary">Growth</span>
                  </th>
                  <th className="px-4 py-3 text-center font-medium">Pro</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature) => (
                  <tr key={feature.name} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{feature.name}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <FeatureCell value={feature.free} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <FeatureCell value={feature.starter} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center bg-primary/5">
                      <div className="flex justify-center">
                        <FeatureCell value={feature.growth} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <FeatureCell value={feature.pro} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <h2 className="mb-8 text-center text-2xl font-bold">
            Frequently asked questions
          </h2>
          <div className="mx-auto max-w-3xl space-y-6">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-lg border p-6">
                <h3 className="font-semibold">{faq.question}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-24 text-center">
          <h2 className="text-2xl font-bold">Ready to see your real numbers?</h2>
          <p className="mt-2 text-muted-foreground">
            Start free. No credit card required.
          </p>
          <Link href="/signup" className="mt-6 inline-block">
            <Button size="lg">Start Free</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
