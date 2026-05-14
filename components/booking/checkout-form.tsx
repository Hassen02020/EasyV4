"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ShieldCheck, CreditCard, Banknote, Wallet } from "lucide-react"
import { submitCheckoutAction } from "@/lib/booking/actions"
import { checkoutSchema } from "@/lib/booking/schemas"

type Method = "card" | "transfer" | "cash" | "at_hotel"

const METHODS: {
  key: Method
  label: string
  desc: string
  icon: typeof CreditCard
}[] = [
  {
    key: "card",
    label: "Carte bancaire",
    desc: "Paiement immédiat via passerelle sécurisée (simulation)",
    icon: CreditCard,
  },
  {
    key: "transfer",
    label: "Virement bancaire",
    desc: "Recevez les coordonnées par email après validation",
    icon: Banknote,
  },
  {
    key: "cash",
    label: "Espèces en agence",
    desc: "Réservation maintenue 48 h en attente de paiement",
    icon: Wallet,
  },
]

export function CheckoutForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [method, setMethod] = useState<Method>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const parsed = checkoutSchema.safeParse({
      paymentMethod: method,
      acceptCgv: acceptCgv as true,
    })
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Champs invalides"
      setError(msg)
      return
    }
    const fd = new FormData()
    fd.set("draft", token)
    fd.set("paymentMethod", method)
    startTransition(async () => {
      try {
        await submitCheckoutAction(fd)
      } catch (err) {
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
          return
        }
        const msg = err instanceof Error ? err.message : "Erreur paiement"
        setError(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">
              Mode de paiement
            </h3>
            <div className="grid gap-3 sm:grid-cols-1">
              {METHODS.map((m) => {
                const active = method === m.key
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    className={
                      "flex items-start gap-3 rounded-lg border p-4 text-left transition-all " +
                      (active
                        ? "border-[#1e3a5f] bg-[#1e3a5f]/5 shadow-sm"
                        : "border-border hover:border-foreground/30")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 inline-flex size-9 items-center justify-center rounded-md " +
                        (active
                          ? "bg-[#1e3a5f] text-white"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">
                        {m.label}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {m.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="cgv"
              checked={acceptCgv}
              onCheckedChange={(v) => setAcceptCgv(Boolean(v))}
            />
            <Label
              htmlFor="cgv"
              className="text-muted-foreground text-sm leading-snug"
            >
              J&apos;accepte les{" "}
              <a href="#" className="text-foreground underline">
                conditions générales de vente
              </a>{" "}
              ainsi que la{" "}
              <a href="#" className="text-foreground underline">
                politique de confidentialité
              </a>{" "}
              de TunisiaGo.
            </Label>
          </div>

          {error ? (
            <div
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <ShieldCheck className="size-4 text-emerald-600" />
            Paiement sécurisé — vos données ne sont jamais stockées en clair.
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={pending || !acceptCgv}
            className="w-full"
          >
            {pending ? "Validation de la réservation…" : "Confirmer & payer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
