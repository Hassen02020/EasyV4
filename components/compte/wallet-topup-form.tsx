"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { submitCustomerTopUp } from "@/lib/finance/b2c-topup-actions"
import { Loader2 } from "lucide-react"

const MIN = 10
const MAX = 5000

export function WalletTopUpForm() {
  const t = useTranslations("Compte")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseFloat(amount.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed < MIN || parsed > MAX) {
      setError(t("walletAmountInvalid"))
      return
    }

    startTransition(async () => {
      const result = await submitCustomerTopUp(parsed)
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.href = result.paymentUrl
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border-border rounded-2xl border p-6"
    >
      <div className="mb-4">
        <label
          htmlFor="topup-amount"
          className="text-foreground mb-1.5 block text-sm font-medium"
        >
          {t("walletAmountLabel")}
        </label>
        <input
          id="topup-amount"
          type="number"
          inputMode="decimal"
          min={MIN}
          max={MAX}
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("walletAmountPlaceholder")}
          disabled={isPending}
          className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-accent w-full rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
        />
        <p className="text-muted-foreground mt-1.5 text-xs">{t("walletAmountHint")}</p>
      </div>

      {error && (
        <p className="text-destructive bg-destructive/10 mb-4 rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !amount}
        className="bg-accent hover:bg-accent/90 disabled:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("walletTopUpLoading")}
          </>
        ) : (
          t("walletTopUpButton")
        )}
      </button>
    </form>
  )
}
