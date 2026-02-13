"use client"

import { useState } from "react"
import { ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ConnectionStatus = "idle" | "connecting" | "connected" | "error"

interface ConnectEtsyProps {
  status?: ConnectionStatus
  shopName?: string
  onConnect?: () => void
  errorMessage?: string
}

export function ConnectEtsy({
  status = "idle",
  shopName,
  onConnect,
  errorMessage,
}: ConnectEtsyProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(status)

  async function handleConnect() {
    if (onConnect) {
      onConnect()
      return
    }

    setConnectionStatus("connecting")
    try {
      window.location.href = "/api/auth/etsy/connect"
    } catch {
      setConnectionStatus("error")
    }
  }

  const currentStatus = status !== "idle" ? status : connectionStatus

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex size-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#F1641E20" }}
          >
            <span className="text-lg font-bold" style={{ color: "#F1641E" }}>
              E
            </span>
          </div>
          <div>
            <CardTitle>Connect your Etsy shop</CardTitle>
            <CardDescription>
              Required to import your orders and listings.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">We will access:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Your shop orders and receipts</li>
            <li>Product listings and inventory</li>
            <li>Shop financial transactions</li>
            <li>Customer information from orders</li>
          </ul>
        </div>

        {currentStatus === "connected" && shopName && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
            <span className="text-green-800 dark:text-green-300">
              Connected to <strong>{shopName}</strong>
            </span>
          </div>
        )}

        {currentStatus === "error" && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
            <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
            <span className="text-red-800 dark:text-red-300">
              {errorMessage || "Failed to connect. Please try again."}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter>
        {currentStatus === "connected" ? (
          <Button variant="outline" disabled className="gap-2">
            <CheckCircle2 className="size-4" />
            Connected
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={currentStatus === "connecting"}
            className="gap-2"
          >
            {currentStatus === "connecting" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="size-4" />
                Connect Etsy
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
