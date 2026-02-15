import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime } from "@/lib/utils/format";

export default async function AdminPage() {
  const supabase = createServiceRoleClient();

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel
  const [
    jobStatusResult,
    profileCountResult,
    planCountsResult,
    failedJobsResult,
    recentSignupsResult,
  ] = await Promise.all([
    // Sync job counts by status (last 24h)
    supabase
      .from("sync_jobs")
      .select("status")
      .gte("created_at", oneDayAgo),
    // Total profiles
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true }),
    // Profiles with plan info
    supabase
      .from("profiles")
      .select("plan, plan_status"),
    // Last 10 failed jobs
    supabase
      .from("sync_jobs")
      .select("id, user_id, job_type, status, error_message, completed_at")
      .eq("status", "failed")
      .order("completed_at", { ascending: false })
      .limit(10),
    // Last 10 signups
    supabase
      .from("profiles")
      .select("user_id, email, plan, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Aggregate job statuses
  const jobCounts: Record<string, number> = {};
  for (const job of jobStatusResult.data ?? []) {
    const s = job.status ?? "unknown";
    jobCounts[s] = (jobCounts[s] ?? 0) + 1;
  }

  // Aggregate plan counts
  const planCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  for (const profile of planCountsResult.data ?? []) {
    const p = profile.plan ?? "free";
    planCounts[p] = (planCounts[p] ?? 0) + 1;
    const s = profile.plan_status ?? "none";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const totalProfiles = profileCountResult.count ?? 0;
  const failedJobs = failedJobsResult.data ?? [];
  const recentSignups = recentSignupsResult.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">System health and user overview.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health (Last 24h)</CardTitle>
            <CardDescription>Sync job status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {["queued", "running", "completed", "failed"].map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <Badge
                    variant={
                      status === "failed"
                        ? "destructive"
                        : status === "completed"
                          ? "default"
                          : "secondary"
                    }
                    className="capitalize"
                  >
                    {status}
                  </Badge>
                  <span className="text-lg font-semibold">
                    {jobCounts[status] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* User Overview */}
        <Card>
          <CardHeader>
            <CardTitle>User Overview</CardTitle>
            <CardDescription>
              {totalProfiles} total profiles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">By Plan</p>
              <div className="flex flex-wrap gap-2">
                {["free", "starter", "growth", "pro"].map((plan) => (
                  <Badge key={plan} variant="outline" className="capitalize">
                    {plan}: {planCounts[plan] ?? 0}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">By Status</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="capitalize">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failed Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Failed Jobs</CardTitle>
          <CardDescription>Last 10 failed sync jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {failedJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No failed jobs.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {job.job_type}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.user_id?.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-destructive">
                        {job.error_message ?? "No details"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.completed_at
                          ? formatRelativeTime(job.completed_at)
                          : "---"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Signups */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Signups</CardTitle>
          <CardDescription>Last 10 registered users</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSignups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No signups yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSignups.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {user.plan ?? "free"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.created_at ? formatDate(user.created_at) : "---"}
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
  );
}
