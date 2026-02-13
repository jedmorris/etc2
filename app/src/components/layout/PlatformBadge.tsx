import { PLATFORMS, type Platform } from "@/lib/utils/constants"
import { cn } from "@/lib/utils"

interface PlatformBadgeProps {
  platform: Platform
  className?: string
}

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const config = PLATFORMS[platform]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      <span
        className="size-2 rounded-full shrink-0"
        style={{ backgroundColor: config.color }}
      />
      {config.name}
    </span>
  )
}
