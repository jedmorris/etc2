import { cn } from "@/lib/utils"
import { AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface UsageMeterProps {
  used: number
  limit: number
  planName: string
}

export function UsageMeter({ used, limit, planName }: UsageMeterProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const isWarning = percentage >= 80
  const isOver = used >= limit

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Order Usage
          {isWarning && !isOver && (
            <AlertTriangle className="size-4 text-amber-500" />
          )}
          {isOver && (
            <AlertTriangle className="size-4 text-red-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress
          value={percentage}
          className={cn(
            isOver && "[&>[data-slot=progress-indicator]]:bg-red-500",
            isWarning && !isOver && "[&>[data-slot=progress-indicator]]:bg-amber-500"
          )}
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            <span
              className={cn(
                "font-medium",
                isOver
                  ? "text-red-600 dark:text-red-400"
                  : isWarning
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground"
              )}
            >
              {used.toLocaleString()}
            </span>
            {" / "}
            {limit.toLocaleString()} orders
          </span>
          <span className="text-muted-foreground text-xs">{planName} plan</span>
        </div>

        {isWarning && !isOver && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            You are approaching your monthly order limit. Consider upgrading your
            plan.
          </p>
        )}

        {isOver && (
          <p className="text-xs text-red-600 dark:text-red-400">
            You have reached your monthly order limit. Overage charges of $0.02
            per order will apply. Upgrade to avoid extra costs.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
