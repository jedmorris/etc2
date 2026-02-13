import { BarChart3, DollarSign, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const FEATURES = [
  {
    icon: BarChart3,
    title: "Real-Time Dashboard",
    description:
      "KPIs, revenue charts, and order tracking updated across all your platforms. See your entire business at a glance.",
  },
  {
    icon: DollarSign,
    title: "True Profit Tracking",
    description:
      "Production costs, platform fees, shipping, and actual margins calculated automatically. Know what you really earn.",
  },
  {
    icon: Users,
    title: "Smart CRM",
    description:
      "Cross-platform customer profiles with RFM segmentation. Identify your best buyers and grow repeat business.",
  },
] as const

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Everything you need to grow
        </h2>
        <p className="mt-3 text-muted-foreground text-lg">
          Built specifically for print-on-demand sellers on Etsy.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon
          return (
            <Card key={feature.title} className="relative">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
