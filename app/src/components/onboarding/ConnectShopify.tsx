"use client"

import { useState } from "react"
import { CheckCircle2, AlertCircle, Loader2, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ConnectionStatus = "idle" | "connecting" | "connected" | "error"

interface ConnectShopifyProps {
  status?: ConnectionStatus
  onConnect?: (domain: string) => void | Promise<void>
  onSkip?: () => void
  errorMessage?: string
}

export function ConnectShopify({
  status = "idle",
  onConnect,
  onSkip,
  errorMessage,
}: ConnectShopifyProps) {
  const [domain, setDomain] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(status)
  const [localError, setLocalError] = useState<string | null>(null)

  function normalizeDomain(input: string): string {
    let d = input.trim().toLowerCase()
    d = d.replace(/^https?:\/\//, "")
    d = d.replace(/\/$/, "")
    if (!d.includes(".")) {
      d = `${d}.myshopify.com`
    }
    return d
  }

  async function handleConnect() {
    if (!domain.trim()) {
      setLocalError("Please enter your Shopify store domain.")
      return
    }

    const normalizedDomain = normalizeDomain(domain)
    setLocalError(null)
    setConnectionStatus("connecting")

    try {
      if (onConnect) {
        await onConnect(normalizedDomain)
      } else {
        window.location.href = `/api/auth/shopify/connect?shop=${encodeURIComponent(normalizedDomain)}`
      }
    } catch (err) {
      setConnectionStatus("error")
      setLocalError(err instanceof Error ? err.message : "Connection failed.")
    }
  }

  const currentStatus = status !== "idle" ? status : connectionStatus
  const displayError = errorMessage || localError

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex size-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#96BF4820" }}
          >
            <span className="text-lg font-bold" style={{ color: "#96BF48" }}>
              S
            </span>
          </div>
          <div>
            <CardTitle>Connect Shopify (Optional)</CardTitle>
            <CardDescription>
              If you also sell on Shopify, connect it to get a unified view.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {currentStatus !== "connected" && (
          <div className="space-y-2">
            <Label htmlFor="shopify-domain">Store domain</Label>
            <Input
              id="shopify-domain"
              type="text"
              placeholder="my-store.myshopify.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value)
                setLocalError(null)
              }}
              disabled={currentStatus === "connecting"}
            />
            <p className="text-xs text-muted-foreground">
              Enter your Shopify store name or full domain.
            </p>
          </div>
        )}

        {currentStatus === "connected" && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
            <span className="text-green-800 dark:text-green-300">
              Shopify connected successfully.
            </span>
          </div>
        )}

        {currentStatus === "error" && displayError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
            <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
            <span className="text-red-800 dark:text-red-300">{displayError}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        {currentStatus === "connected" ? (
          <Button variant="outline" disabled className="gap-2">
            <CheckCircle2 className="size-4" />
            Connected
          </Button>
        ) : (
          <>
            <Button
              onClick={handleConnect}
              disabled={currentStatus === "connecting" || !domain.trim()}
              className="gap-2"
            >
              {currentStatus === "connecting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Shopify"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={onSkip}
              disabled={currentStatus === "connecting"}
              className="gap-2 text-muted-foreground"
            >
              <SkipForward className="size-4" />
              Skip
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
