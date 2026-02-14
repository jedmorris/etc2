import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Lock, ArrowLeft } from "lucide-react"
import { hasFeature, type PlanId } from "@/lib/stripe/plans"
import { formatNumber, formatDate } from "@/lib/utils/format"

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Newsletter Subscribers</CardTitle>
          <CardDescription>
            Newsletter subscriber management requires the Growth plan or above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/settings/billing">
            <Button>Upgrade to Growth</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

const STATUS_FILTERS = ["all", "active", "failed", "pending", "unsubscribed"] as const
type StatusFilter = typeof STATUS_FILTERS[number]

function substackBadge(status: string) {
  switch (status) {
    case "subscribed":
      return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Subscribed</Badge>
    case "failed":
      return <Badge variant="destructive">Failed</Badge>
    case "pending":
      return <Badge variant="outline">Pending</Badge>
    case "confirmation_sent":
      return <Badge variant="secondary">Confirmation Sent</Badge>
    case "unsubscribed":
      return <Badge variant="secondary">Unsubscribed</Badge>
    default:
      return <Badge variant="outline" className="capitalize">{status}</Badge>
  }
}

const PAGE_SIZE = 50

export default async function NewsletterSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle()

  const plan = (profile?.plan ?? "free") as PlanId

  if (!hasFeature(plan, "newsletter")) {
    return <UpgradePrompt />
  }

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const statusFilter = (params.status ?? "all") as StatusFilter
  const searchQuery = params.q ?? ""

  // Build base query for count
  let countQuery = supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  if (statusFilter === "active") {
    countQuery = countQuery.eq("beehiiv_status", "active")
  } else if (statusFilter === "failed") {
    countQuery = countQuery.eq("substack_status", "failed")
  } else if (statusFilter === "pending") {
    countQuery = countQuery.eq("substack_status", "pending")
  } else if (statusFilter === "unsubscribed") {
    countQuery = countQuery.or("beehiiv_status.eq.unsubscribed,substack_status.eq.unsubscribed")
  }

  if (searchQuery) {
    countQuery = countQuery.ilike("email", `%${searchQuery}%`)
  }

  const { count: totalCount } = await countQuery
  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Build data query
  let dataQuery = supabase
    .from("newsletter_subscribers")
    .select("id, email, beehiiv_status, substack_status, error_message, created_at, synced_to_substack_at")
    .eq("user_id", user.id)

  if (statusFilter === "active") {
    dataQuery = dataQuery.eq("beehiiv_status", "active")
  } else if (statusFilter === "failed") {
    dataQuery = dataQuery.eq("substack_status", "failed")
  } else if (statusFilter === "pending") {
    dataQuery = dataQuery.eq("substack_status", "pending")
  } else if (statusFilter === "unsubscribed") {
    dataQuery = dataQuery.or("beehiiv_status.eq.unsubscribed,substack_status.eq.unsubscribed")
  }

  if (searchQuery) {
    dataQuery = dataQuery.ilike("email", `%${searchQuery}%`)
  }

  const { data: subscribers } = await dataQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const subscriberList = subscribers ?? []

  function buildFilterUrl(filter: StatusFilter) {
    const params = new URLSearchParams()
    if (filter !== "all") params.set("status", filter)
    if (searchQuery) params.set("q", searchQuery)
    const qs = params.toString()
    return `/app/newsletter/subscribers${qs ? `?${qs}` : ""}`
  }

  function buildPageUrl(p: number) {
    const params = new URLSearchParams()
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (searchQuery) params.set("q", searchQuery)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return `/app/newsletter/subscribers${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/newsletter">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Subscribers</h1>
            <p className="text-muted-foreground">
              {formatNumber(total)} total subscribers
            </p>
          </div>
        </div>
      </div>

      {/* Search + Filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex-1 min-w-[200px] max-w-sm">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by email..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {statusFilter !== "all" && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
        </form>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <Link key={filter} href={buildFilterUrl(filter)}>
              <Badge
                variant={statusFilter === filter ? "default" : "outline"}
                className="cursor-pointer capitalize"
              >
                {filter}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscriber List</CardTitle>
          <CardDescription>
            Newsletter subscribers synced from Beehiiv to Substack.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriberList.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {searchQuery || statusFilter !== "all"
                ? "No subscribers match your filters."
                : "No subscribers yet. Subscribers will appear after your first Beehiiv webhook."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Beehiiv</TableHead>
                    <TableHead>Substack</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Synced At</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriberList.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={sub.beehiiv_status === "active" ? "default" : "secondary"}
                          className={sub.beehiiv_status === "active" ? "bg-emerald-600 hover:bg-emerald-700" : "capitalize"}
                        >
                          {sub.beehiiv_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{substackBadge(sub.substack_status)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-destructive">
                        {sub.error_message ?? "---"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sub.synced_to_substack_at
                          ? formatDate(sub.synced_to_substack_at)
                          : "---"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(sub.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildPageUrl(page - 1)}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildPageUrl(page + 1)}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
