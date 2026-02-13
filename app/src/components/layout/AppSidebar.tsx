"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  TrendingUp,
  Truck,
  Settings,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PlanId } from "@/lib/stripe/plans"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  requiredPlan?: PlanId
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Orders", href: "/app/orders", icon: ShoppingCart },
  { label: "Products", href: "/app/products", icon: Package },
  { label: "Financials", href: "/app/financials", icon: DollarSign, requiredPlan: "starter" },
  { label: "Customers", href: "/app/customers", icon: Users, requiredPlan: "growth" },
  { label: "Bestsellers", href: "/app/bestsellers", icon: TrendingUp, requiredPlan: "growth" },
  { label: "Fulfillment", href: "/app/fulfillment", icon: Truck, requiredPlan: "growth" },
]

const BOTTOM_ITEMS: NavItem[] = [
  { label: "Settings", href: "/app/settings", icon: Settings },
]

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  pro: 3,
}

function isLocked(plan: PlanId, requiredPlan?: PlanId): boolean {
  if (!requiredPlan) return false
  return PLAN_RANK[plan] < PLAN_RANK[requiredPlan]
}

interface AppSidebarProps {
  plan: PlanId
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function AppSidebar({ plan, collapsed = false, onCollapsedChange }: AppSidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(collapsed)

  function handleCollapse() {
    const next = !isCollapsed
    setIsCollapsed(next)
    onCollapsedChange?.(next)
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "bg-card border-r flex flex-col h-screen sticky top-0 transition-all duration-200",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b">
          {!isCollapsed && (
            <Link href="/app" className="text-xl font-bold tracking-tight">
              etC2
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCollapse}
            className={cn(isCollapsed && "mx-auto")}
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const locked = isLocked(plan, item.requiredPlan)
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon

            const linkContent = (
              <Link
                href={locked ? "#" : item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  locked && "opacity-50 cursor-not-allowed",
                  isCollapsed && "justify-center px-2"
                )}
                onClick={(e) => {
                  if (locked) e.preventDefault()
                }}
              >
                <Icon className="size-4 shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {locked && <Lock className="size-3 text-muted-foreground" />}
                  </>
                )}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">
                    <span>{item.label}</span>
                    {locked && <span className="ml-1 text-muted-foreground">(Locked)</span>}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{linkContent}</div>
          })}

          <Separator className="my-2" />

          {/* Bottom nav items */}
          {BOTTOM_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{linkContent}</div>
          })}
        </nav>
      </aside>
    </TooltipProvider>
  )
}
