"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Menu,
  RefreshCw,
  User,
  CreditCard,
  LogOut,
  LayoutDashboard,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  TrendingUp,
  Truck,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

const PAGE_TITLES: Record<string, string> = {
  "/app": "Dashboard",
  "/app/orders": "Orders",
  "/app/products": "Products",
  "/app/financials": "Financials",
  "/app/customers": "Customers",
  "/app/bestsellers": "Bestsellers",
  "/app/fulfillment": "Fulfillment",
  "/app/settings": "Settings",
  "/app/settings/billing": "Billing",
  "/app/settings/account": "Account",
}

const MOBILE_NAV = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Orders", href: "/app/orders", icon: ShoppingCart },
  { label: "Products", href: "/app/products", icon: Package },
  { label: "Financials", href: "/app/financials", icon: DollarSign },
  { label: "Customers", href: "/app/customers", icon: Users },
  { label: "Bestsellers", href: "/app/bestsellers", icon: TrendingUp },
  { label: "Fulfillment", href: "/app/fulfillment", icon: Truck },
  { label: "Settings", href: "/app/settings", icon: Settings },
]

interface SyncStatus {
  syncing: boolean
  lastSyncAt?: string | null
}

interface AppHeaderProps {
  userEmail?: string
  userAvatarUrl?: string
  syncStatus?: SyncStatus
  onSync?: () => void
  onLogout?: () => void
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + "/")) return title
  }
  return "Dashboard"
}

function formatLastSync(dateStr?: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString()
}

export function AppHeader({
  userEmail,
  userAvatarUrl,
  syncStatus,
  onSync,
  onLogout,
}: AppHeaderProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const pageTitle = getPageTitle(pathname)
  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "U"

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      {/* Mobile hamburger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="md:hidden">
            <Menu className="size-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-xl font-bold tracking-tight">
              etC2
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-2">
            {MOBILE_NAV.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Page title */}
      <h1 className="text-lg font-semibold">{pageTitle}</h1>

      <div className="flex-1" />

      {/* Sync status */}
      {syncStatus && (
        <div className="hidden sm:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={syncStatus.syncing}
            className="gap-1.5 text-muted-foreground"
          >
            <RefreshCw
              className={cn("size-3.5", syncStatus.syncing && "animate-spin")}
            />
            <span className="text-xs">
              {syncStatus.syncing
                ? "Syncing..."
                : `Synced ${formatLastSync(syncStatus.lastSyncAt)}`}
            </span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
        </div>
      )}

      {/* User avatar dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full">
            <Avatar size="sm">
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt="User" />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium truncate">{userEmail || "User"}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/app/settings/account">
                <User className="size-4" />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/app/settings/billing">
                <CreditCard className="size-4" />
                Billing
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
