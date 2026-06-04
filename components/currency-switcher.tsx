"use client"

import { Check, ChevronDown, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCurrency } from "@/components/currency-context"
import { CURRENCIES, CURRENCY_META } from "@/lib/currency"

interface CurrencySwitcherProps {
  variant?: "desktop" | "mobile"
}

export function CurrencySwitcher({ variant = "desktop" }: CurrencySwitcherProps) {
  const { currency, setCurrency, meta } = useCurrency()

  if (variant === "mobile") {
    const nextCurrencies = CURRENCIES.filter((c) => c !== currency)
    const next = nextCurrencies[0]
    return (
      <button
        type="button"
        onClick={() => setCurrency(next)}
        className="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
        aria-label={`Changer devise de ${currency} vers ${next}`}
      >
        <Wallet className="size-5 text-[#1e3a5f]" aria-hidden="true" />
        <span className="flex-1 text-left">Devise</span>
        <span className="text-[#1e3a5f] font-semibold">{currency}</span>
      </button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm font-medium hover:bg-[#1e3a5f]/10"
          aria-label="Changer de devise"
        >
          <Wallet className="size-4 text-[#1e3a5f]" aria-hidden="true" />
          <span className="hidden sm:inline">Devise</span>
          <span className="text-[#1e3a5f] font-semibold">{currency}</span>
          <ChevronDown className="size-3 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {CURRENCIES.map((c) => {
          const m = CURRENCY_META[c]
          return (
            <DropdownMenuItem
              key={c}
              onClick={() => setCurrency(c)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{m.flag}</span>
                <span className="font-medium">{c}</span>
                <span className="text-muted-foreground text-xs">— {m.label}</span>
              </span>
              {c === currency && (
                <Check className="size-3.5 text-[#1e3a5f]" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
