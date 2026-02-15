"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatRelativeTime } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

interface SyncInfo {
  status: string
  created_at: string
}

export function LastSyncIndicator({ userId }: { userId: string }) {
  const [sync, setSync] = useState<SyncInfo | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("sync_jobs")
      .select("status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) setSync(data[0])
      })
  }, [userId])

  if (!sync) return null

  const dotColor =
    sync.status === "completed"
      ? "bg-green-500"
      : sync.status === "running"
        ? "bg-yellow-500 animate-pulse"
        : sync.status === "failed"
          ? "bg-red-500"
          : "bg-gray-400"

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("inline-block size-2 rounded-full", dotColor)} />
      <span>Last synced {formatRelativeTime(sync.created_at)}</span>
    </div>
  )
}
