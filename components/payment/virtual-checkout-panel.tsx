"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle, Loader2, CreditCard } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { simulateVirtualPayment } from "@/lib/payment/virtual-checkout-actions"

export function VirtualCheckoutPanel({
  paymentRef,
  amountTnd,
  publicRef,
  guestAccessToken,
  offerLabel,
}: {
  paymentRef: string
  amountTnd: number
  publicRef: string
  guestAccessToken: string
  offerLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function simulate(outcome: "success" | "failure") {
    setError(null)
    startTransition(async () => {
      const result = await simulateVirtualPayment(paymentRef, outcome)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/booking/confirmation/${publicRef}?token=${guestAccessToken}`)
    })
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CreditCard className="text-muted-foreground mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">{offerLabel}</p>
        <p className="text-3xl font-bold">{amountTnd.toFixed(2)} DT</p>
        <p className="text-muted-foreground text-xs">Réservation {publicRef}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <Button
          className="w-full gap-2"
          size="lg"
          disabled={pending}
          onClick={() => simulate("success")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Simuler un paiement réussi
        </Button>
        <Button
          className="w-full gap-2"
          size="lg"
          variant="outline"
          disabled={pending}
          onClick={() => simulate("failure")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Simuler un paiement refusé
        </Button>
      </CardContent>
    </Card>
  )
}
