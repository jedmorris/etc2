"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const STATUSES = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
] as const;

interface ProductFiltersProps {
  currentQuery?: string;
  currentStatus?: string;
}

export function ProductFilters({ currentQuery, currentStatus }: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all" && value !== "") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      startTransition(() => {
        router.push(`/app/products?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition]
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            variant={
              (currentStatus ?? "all") === s.value ? "default" : "outline"
            }
            size="sm"
            onClick={() => updateParams("status", s.value)}
            disabled={isPending}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          defaultValue={currentQuery ?? ""}
          className="pl-8 w-64"
          onChange={(e) => {
            const value = e.target.value;
            // Debounce by waiting for user to stop typing
            const timeout = setTimeout(() => {
              updateParams("q", value);
            }, 300);
            return () => clearTimeout(timeout);
          }}
        />
      </div>
    </div>
  );
}
