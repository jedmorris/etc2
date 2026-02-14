"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Client component that tracks page views.
 * Replace the console.log with your analytics provider
 * (e.g. PostHog, Plausible, Mixpanel) when ready.
 */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    // Stub: replace with actual analytics call
    if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
      // Example: posthog.capture('$pageview', { path: pathname })
      console.debug("[analytics] pageview", pathname);
    }
  }, [pathname]);

  return null;
}
