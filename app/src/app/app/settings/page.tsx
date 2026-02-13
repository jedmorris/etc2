"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plug,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/format";
import { PLATFORMS } from "@/lib/utils/constants";

interface ConnectedAccount {
  platform: string;
  platform_shop_name: string | null;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("connected_accounts")
      .select(
        "platform, platform_shop_name, status, last_sync_at, error_message"
      )
      .eq("user_id", user.id);

    setAccounts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function getAccountForPlatform(platform: string): ConnectedAccount | null {
    return accounts.find((a) => a.platform === platform) ?? null;
  }

  async function handleConnect(platform: string) {
    const oauthUrls: Record<string, string> = {
      etsy: `/api/auth/etsy/connect`,
      shopify: `/api/auth/shopify/connect`,
      printify: `/api/auth/printify/connect`,
    };
    window.location.href = oauthUrls[platform] || "#";
  }

  async function handleDisconnect(platform: string) {
    setDisconnecting(platform);
    try {
      const res = await fetch("/api/auth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (res.ok) {
        await fetchAccounts();
      }
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleSync(platform: string) {
    setSyncing(platform);
    try {
      await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      // Re-fetch after a short delay to show updated sync time
      setTimeout(() => {
        fetchAccounts();
        setSyncing(null);
      }, 2000);
    } catch {
      setSyncing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allPlatforms = ["etsy", "printify", "shopify"] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        <p className="text-muted-foreground">
          Manage your connected store and fulfillment accounts.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {allPlatforms.map((platform) => {
          const account = getAccountForPlatform(platform);
          const platformInfo = PLATFORMS[platform];
          const isConnected = account?.status === "connected" || account?.status === "active";
          const hasError =
            account?.status === "error" ||
            account?.status === "token_expired";
          const isSyncing = syncing === platform;
          const isDisconnecting = disconnecting === platform;

          return (
            <Card key={platform}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{platformInfo.name}</CardTitle>
                  {isConnected ? (
                    <Badge
                      variant="default"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <CheckCircle className="size-3" />
                      Connected
                    </Badge>
                  ) : hasError ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" />
                      Error
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="size-3" />
                      Disconnected
                    </Badge>
                  )}
                </div>
                {account?.platform_shop_name && (
                  <CardDescription>{account.platform_shop_name}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {isConnected && account ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="capitalize">{account.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span>
                        {account.last_sync_at
                          ? formatRelativeTime(account.last_sync_at)
                          : "Never"}
                      </span>
                    </div>
                  </div>
                ) : hasError && account?.error_message ? (
                  <p className="text-sm text-destructive">
                    {account.error_message}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Connect your {platformInfo.name} account to sync orders,
                    products, and data.
                  </p>
                )}
              </CardContent>
              <CardFooter className="gap-2">
                {isConnected || hasError ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(platform)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 size-3" />
                      )}
                      {isSyncing ? "Syncing..." : "Sync Now"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDisconnect(platform)}
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : null}
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleConnect(platform)}
                    className="gap-1"
                  >
                    <Plug className="size-3" />
                    Connect {platformInfo.name}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
