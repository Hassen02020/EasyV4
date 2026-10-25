"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { WalletTopUpForm } from "@/components/compte/wallet-topup-form"
import { WalletManualTopUpForm } from "@/components/compte/wallet-manual-topup-form"
import {
  TOPUP_METHOD_LABEL_KEYS,
  type TopupMethodKey,
} from "@/lib/finance/topup-method-display"

export interface ManualMethodOption {
  method: Exclude<TopupMethodKey, "card">
  details: Record<string, string>
  instructions: string | null
}

interface Props {
  /** Paymee configuré sur ce déploiement (clé présente). */
  cardAvailable: boolean
  /** Moyens manuels actifs ET complets uniquement. */
  manualMethods: ManualMethodOption[]
}

export function WalletTopUpPanel({ cardAvailable, manualMethods }: Props) {
  const t = useTranslations("Compte")
  const options: TopupMethodKey[] = [
    ...(cardAvailable ? (["card"] as const) : []),
    ...manualMethods.map((m) => m.method),
  ]
  const [selected, setSelected] = useState<TopupMethodKey | null>(
    options[0] ?? null,
  )

  if (options.length === 0 || !selected) {
    return (
      <div className="bg-card border-border text-muted-foreground rounded-2xl border p-6 text-sm">
        {t("walletNoMethods")}
      </div>
    )
  }

  const manual = manualMethods.find((m) => m.method === selected)

  return (
    <div className="space-y-4">
      <fieldset className="bg-card border-border rounded-2xl border p-4">
        <legend className="text-foreground px-1 text-sm font-semibold">
          {t("walletMethodsTitle")}
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {options.map((method) => (
            <label
              key={method}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                selected === method
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="topup-method"
                value={method}
                checked={selected === method}
                onChange={() => setSelected(method)}
                className="accent-accent mt-1"
              />
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-medium">
                  {t(TOPUP_METHOD_LABEL_KEYS[method])}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {method === "card"
                    ? t("walletMethodCardDesc")
                    : t("walletManualDesc")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected === "card" ? (
        <WalletTopUpForm />
      ) : manual ? (
        <div className="bg-card border-border rounded-2xl border p-6">
          <WalletManualTopUpForm
            key={manual.method}
            method={manual.method}
            details={manual.details}
            instructions={manual.instructions}
          />
        </div>
      ) : null}
    </div>
  )
}
