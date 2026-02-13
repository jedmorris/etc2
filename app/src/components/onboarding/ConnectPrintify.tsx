"use client"

import { useState } from "react"
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react"
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

interface ConnectPrintifyProps {
  status?: ConnectionStatus
  onConnect?: (token: string) => void | Promise<void>
  errorMessage?: string
}

export function ConnectPrintify({
  status = "idle",
  onConnect,
  errorMessage,
}: ConnectPrintifyProps) {
  const [token, setToken] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(status)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleConnect() {
    if (!token.trim()) {
      setLocalError("Please enter your Personal Access Token.")
      return
    }

    setLocalError(null)
    setConnectionStatus("connecting")

    try {
      if (onConnect) {
        await onConnect(token.trim())
      } else {
        const res = await fetch("/api/auth/printify/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Failed to validate token.")
        }

        setConnectionStatus("connected")
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
            style={{ backgroundColor: "#39B54A20" }}
          >
            <span className="text-lg font-bold" style={{ color: "#39B54A" }}>
              P
            </span>
          </div>
          <div>
            <CardTitle>Connect Printify</CardTitle>
            <CardDescription>
              Link your Printify account to track production and costs.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How to get your token:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Go to{" "}
              <a
                href="https://printify.com/app/account/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
              >
                Printify API Settings
                <ExternalLink className="size-3" />
              </a>
            </li>
            <li>Click &quot;Generate&quot; to create a new token</li>
            <li>Copy the token and paste it below</li>
          </ol>
        </div>

        {currentStatus !== "connected" && (
          <div className="space-y-2">
            <Label htmlFor="printify-token">Personal Access Token</Label>
            <Input
              id="printify-token"
              type="password"
              placeholder="Paste your Printify token..."
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setLocalError(null)
              }}
              disabled={currentStatus === "connecting"}
            />
          </div>
        )}

        {currentStatus === "connected" && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
            <span className="text-green-800 dark:text-green-300">
              Printify connected successfully.
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

      <CardFooter>
        {currentStatus === "connected" ? (
          <Button variant="outline" disabled className="gap-2">
            <CheckCircle2 className="size-4" />
            Connected
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={currentStatus === "connecting" || !token.trim()}
            className="gap-2"
          >
            {currentStatus === "connecting" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Validating...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
