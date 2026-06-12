"use client"

import { useEffect, useState, useTransition } from "react"
import { Wallet, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getWalletBalance } from "@/lib/wallet/actions"
import { cn } from "@/lib/utils"

interface WalletStatusProps {
  agencyId: string
  /** Affichage compact pour header */
  compact?: boolean
  className?: string
}

export function WalletStatus({
  agencyId,
  compact = false,
  className,
}: WalletStatusProps) {
  const [balance, setBalance] = useState<string | null>(null)
  const [currency, setCurrency] = useState("TND")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  const LOW_THRESHOLD = 100

  const refresh = () => {
    startTransition(async () => {
      const result = await getWalletBalance(agencyId)
      if (result.ok) {
        setBalance(result.data.balance)
        setCurrency(result.data.currency)
        setError(false)
      } else {
        setError(true)
      }
    })
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [agencyId])

  const balanceNum = balance !== null ? parseFloat(balance) : null
  const isLow = balanceNum !== null && balanceNum < LOW_THRESHOLD
  const isZero = balanceNum !== null && balanceNum <= 0

  const formatBalance = (val: string) => {
    const num = parseFloat(val)
    return num.toLocaleString("fr-TN", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex cursor-default items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              isZero
                ? "bg-destructive/10 text-destructive"
                : isLow
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700",
              className,
            )}
          >
            {isZero || isLow ? (
              <AlertTriangle className="size-3.5" />
            ) : (
              <Wallet className="size-3.5" />
            )}
            {balance === null ? (
              <span className="opacity-50">…</span>
            ) : (
              <span>
                {formatBalance(balance)} {currency}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-medium">Solde Wallet</p>
          {isLow && (
            <p className="text-amber-600 text-xs">
              ⚠ Solde faible — rechargez avant la prochaine réservation
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isZero
          ? "border-destructive/40 bg-destructive/5"
          : isLow
            ? "border-amber-300 bg-amber-50"
            : "border-emerald-300 bg-emerald-50",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              isZero
                ? "bg-destructive/20"
                : isLow
                  ? "bg-amber-200"
                  : "bg-emerald-200",
            )}
          >
            {isLow || isZero ? (
              <AlertTriangle
                className={cn(
                  "size-5",
                  isZero ? "text-destructive" : "text-amber-700",
                )}
              />
            ) : (
              <TrendingUp className="size-5 text-emerald-700" />
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Solde Wallet
            </p>
            {error ? (
              <p className="text-destructive text-sm">Erreur de chargement</p>
            ) : balance === null ? (
              <div className="bg-muted h-5 w-28 animate-pulse rounded" />
            ) : (
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  isZero
                    ? "text-destructive"
                    : isLow
                      ? "text-amber-700"
                      : "text-emerald-700",
                )}
              >
                {formatBalance(balance)}{" "}
                <span className="text-sm font-semibold">{currency}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLow && !isZero && (
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-700 text-xs"
            >
              Solde faible
            </Badge>
          )}
          {isZero && (
            <Badge variant="destructive" className="text-xs">
              Solde épuisé
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={refresh}
            disabled={isPending}
            aria-label="Actualiser le solde"
          >
            <RefreshCw
              className={cn("size-3.5", isPending && "animate-spin")}
            />
          </Button>
        </div>
      </div>
    </div>
  )
}
