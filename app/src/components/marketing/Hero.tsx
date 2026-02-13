import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.08),transparent)]" />

      <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32 lg:py-40 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Your Etsy POD business,{" "}
          <span className="text-primary">one dashboard</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
          Connect Etsy + Printify + Shopify. See profits, track orders, know
          your customers.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">
              Start Free
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
