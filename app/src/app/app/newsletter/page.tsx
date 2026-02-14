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
import { Lock, Mail, Users, CheckCircle, AlertTriangle } from "lucide-react"
import { hasFeature, type PlanId } from "@/lib/stripe/plans"
import { formatNumber, formatDate } from "@/lib/utils/format"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { NewsletterGrowthChart } from "@/components/dashboard/NewsletterGrowthChart"

function UpgradePrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">Newsletter Sync</CardTitle>
          <CardDescription>
            Newsletter subscriber sync and analytics require the Growth plan or
            above.
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

function syncLogStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle className="size-3" />
          Success
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" />
          Failed
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary" className="capitalize">
          {status}
        </Badge>
      )
  }
}

export default async function NewsletterPage() {
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

  // KPI queries
  const { count: totalCount } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  const { count: activeCount } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("beehiiv_status", "active")

  const { count: syncedCount } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("substack_status", "subscribed")

  const { count: failedCount } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("substack_status", "failed")

  // Growth chart: cumulative subscribers by created_at date
  const { data: subscribers } = await supabase
    .from("newsletter_subscribers")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  const dailyMap = new Map<string, number>()
  for (const sub of subscribers ?? []) {
    const date = sub.created_at.slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1)
  }

  let cumulative = 0
  const chartData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      cumulative += count
      return { date, subscribers: cumulative }
    })

  // Recent sync log (last 10)
  const { data: recentSyncLog } = await supabase
    .from("newsletter_sync_log")
    .select("id, action, source, status, error_message, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground">
            Beehiiv to Substack subscriber sync overview.
          </p>
        </div>
        <Link href="/app/newsletter/subscribers">
          <Button variant="outline" className="gap-2">
            <Users className="size-4" />
            View Subscribers
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Subscribers"
          value={formatNumber(totalCount ?? 0)}
          icon={Mail}
        />
        <KpiCard
          title="Active (Beehiiv)"
          value={formatNumber(activeCount ?? 0)}
          icon={Users}
        />
        <KpiCard
          title="Synced (Substack)"
          value={formatNumber(syncedCount ?? 0)}
          icon={CheckCircle}
        />
        <KpiCard
          title="Failed"
          value={formatNumber(failedCount ?? 0)}
          icon={AlertTriangle}
        />
      </div>

      {/* Growth Chart */}
      {chartData.length > 1 ? (
        <NewsletterGrowthChart data={chartData} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Subscriber Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
              <div className="text-center">
                <Mail className="mx-auto mb-2 size-8" />
                <p className="text-sm">Not enough data for chart</p>
                <p className="text-xs">Growth chart will appear with more subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Sync Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Activity</CardTitle>
          <CardDescription>Latest newsletter sync operations</CardDescription>
        </CardHeader>
        <CardContent>
          {(recentSyncLog ?? []).length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              No sync activity yet. Sync events will appear as subscribers are processed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentSyncLog ?? []).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="capitalize font-medium">
                        {log.action}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.source.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>{syncLogStatusBadge(log.status)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-destructive">
                        {log.error_message ?? "---"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(log.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
