"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { submitManualTopUp } from "@/lib/finance/b2c-topup-actions"
import {
  hasAtMostTwoDecimals,
  TOPUP_DETAIL_FIELDS,
} from "@/lib/finance/topup-method-display"

const MIN = 10
const MAX = 5000

interface Props {
  method: string
  details: Record<string, string>
  instructions: string | null
}

/** Déclaration d'une recharge manuelle : affiche les coordonnées configurées
 * par le super_admin (jamais de valeur par défaut), puis enregistre une
 * demande en attente de vérification. */
export function WalletManualTopUpForm({
  method,
  details,
  instructions,
}: Props) {
  const t = useTranslations("Compte")
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!hasAtMostTwoDecimals(amount)) {
      setError(t("walletAmountPrecision"))
      return
    }
    const parsed = parseFloat(amount.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed < MIN || parsed > MAX) {
      setError(t("walletAmountInvalid"))
      return
    }
    startTransition(async () => {
      const result = await submitManualTopUp({
        method,
        amount: amount.trim(),
        reference,
        note,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSubmitted(true)
      setAmount("")
      setReference("")
      setNote("")
    })
  }

  const inputClass =
    "border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-accent w-full rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 border-border rounded-xl border p-4">
        <p className="text-foreground mb-2 text-sm font-semibold">
          {t("walletInstructionsTitle")}
        </p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {TOPUP_DETAIL_FIELDS.filter(([key]) => details[key]).map(
            ([key, labelKey]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{t(labelKey)}</dt>
                <dd
                  className="text-foreground font-medium break-all select-all"
                  dir={/^[A-Z0-9 ]+$/.test(details[key]!) ? "ltr" : undefined}
                >
                  {details[key]}
                </dd>
              </div>
            ),
          )}
        </dl>
        {instructions && (
          <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">
            {instructions}
          </p>
        )}
      </div>

      {submitted && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-300"
        >
          {t("walletManualSubmitted")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor={`manual-amount-${method}`}
            className="text-foreground mb-1.5 block text-sm font-medium"
          >
            {t("walletAmountLabel")}
          </label>
          <input
            id={`manual-amount-${method}`}
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("walletAmountPlaceholder")}
            disabled={isPending}
            className={inputClass}
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            {t("walletAmountHint")}
          </p>
        </div>

        <div>
          <label
            htmlFor={`manual-reference-${method}`}
            className="text-foreground mb-1.5 block text-sm font-medium"
          >
            {t("walletReferenceLabel")}
          </label>
          <input
            id={`manual-reference-${method}`}
            type="text"
            maxLength={64}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={isPending}
            className={inputClass}
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            {t("walletReferenceHint")}
          </p>
        </div>

        <div>
          <label
            htmlFor={`manual-note-${method}`}
            className="text-foreground mb-1.5 block text-sm font-medium"
          >
            {t("walletNoteLabel")}
          </label>
          <textarea
            id={`manual-note-${method}`}
            maxLength={500}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            className={inputClass}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !amount}
          className="bg-accent hover:bg-accent/90 disabled:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("walletManualSubmit")}
        </button>
      </form>
    </div>
  )
}
