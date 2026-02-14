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
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react"
import { formatDate, formatRelativeTime } from "@/lib/utils/format"

const STATUS_FILTERS = ["all", "completed", "failed", "running", "pending"] as const
type StatusFilter = typeof STATUS_FILTERS[number]

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle className="size-3" />
          Completed
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" />
          Failed
        </Badge>
      )
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Running
        </Badge>
      )
    case "pending":
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="size-3" />
          Pending
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

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "---"
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export default async function SyncHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const params = await searchParams
  const statusFilter = (params.status ?? "all") as StatusFilter

  let query = supabase
    .from("sync_jobs")
    .select("id, job_type, status, records_processed, started_at, completed_at, error_message, created_at")
    .eq("user_id", user.id)

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }

  const { data: syncJobs } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  const jobList = syncJobs ?? []

  function buildFilterUrl(filter: StatusFilter) {
    if (filter === "all") return "/app/settings/sync-history"
    return `/app/settings/sync-history?status=${filter}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync History</h1>
          <p className="text-muted-foreground">
            Recent sync job activity across all platforms.
          </p>
        </div>
      </div>

      {/* Filter pills */}
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

      <Card>
        <CardHeader>
          <CardTitle>Sync Jobs</CardTitle>
          <CardDescription>Last 100 sync jobs for your account</CardDescription>
        </CardHeader>
        <CardContent>
          {jobList.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {statusFilter !== "all"
                ? "No sync jobs match this filter."
                : "No sync jobs yet. Jobs will appear when your stores sync."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobList.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium capitalize">
                        {job.job_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>{statusBadge(job.status)}</TableCell>
                      <TableCell className="text-right">
                        {job.records_processed}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDuration(job.started_at, job.completed_at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-destructive">
                        {job.error_message ?? "---"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(job.created_at)}
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
