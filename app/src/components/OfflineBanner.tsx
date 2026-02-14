"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
    }
    function handleOffline() {
      setOffline(true);
    }

    // Check initial state
    if (!navigator.onLine) setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <WifiOff className="size-4" />
        You are offline. Some features may not work.
      </div>
    </div>
  );
}
