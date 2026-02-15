"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, subDays, startOfYear } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: -1 },
  { label: "All time", days: 0 },
] as const

export function DateRangePicker() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = React.useState(false)

  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  const dateRange: DateRange | undefined = React.useMemo(() => {
    if (fromParam && toParam) {
      return { from: new Date(fromParam), to: new Date(toParam) }
    }
    // Default: last 30 days
    return { from: subDays(new Date(), 30), to: new Date() }
  }, [fromParam, toParam])

  function applyRange(from: Date, to: Date) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", format(from, "yyyy-MM-dd"))
    params.set("to", format(to, "yyyy-MM-dd"))
    router.push(`?${params.toString()}`)
    setOpen(false)
  }

  function handlePreset(days: number) {
    const to = new Date()
    let from: Date
    if (days === 0) {
      from = new Date("2020-01-01")
    } else if (days === -1) {
      from = startOfYear(to)
    } else {
      from = subDays(to, days)
    }
    applyRange(from, to)
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    if (range?.from && range?.to) {
      applyRange(range.from, range.to)
    }
  }

  const displayLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`
    : "Select date range"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !dateRange && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          <span className="hidden sm:inline">{displayLabel}</span>
          <span className="sm:hidden">
            {dateRange?.from ? format(dateRange.from, "MMM d") : "Range"}
            {dateRange?.to ? ` - ${format(dateRange.to, "MMM d")}` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="flex flex-col gap-1 border-r p-3">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
