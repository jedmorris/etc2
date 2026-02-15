"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RotateCw } from "lucide-react"

export function RetryButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRetry() {
    setLoading(true)
    try {
      const res = await fetch("/api/sync/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRetry}
      disabled={loading}
      className="h-7 px-2 text-xs"
    >
      <RotateCw className={`mr-1 size-3 ${loading ? "animate-spin" : ""}`} />
      Retry
    </Button>
  )
}
