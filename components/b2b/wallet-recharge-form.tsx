"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, CheckCircle2, CreditCard } from "lucide-react"
import {
  submitRechargeRequest,
  initiateOnlineRecharge,
  type RechargeMethodType,
} from "@/lib/finance/recharge-actions"

interface WalletRechargeFormProps {
  agencyId: string
  userId: string
  paymeeAvailable?: boolean
}

const METHODS: {
  value: RechargeMethodType
  label: string
  description: string
}[] = [
  {
    value: "cash",
    label: "Espèces à l'agence",
    description: "Paiement en espèces directement à nos bureaux",
  },
  {
    value: "bank_transfer",
    label: "Virement bancaire",
    description: "Virement depuis votre compte bancaire",
  },
  {
    value: "postal_transfer",
    label: "Virement postal (CCP)",
    description: "Virement depuis votre compte postal",
  },
  {
    value: "postal_mandate",
    label: "Mandat postal",
    description: "Mandat envoyé via La Poste Tunisienne",
  },
  {
    value: "check",
    label: "Chèque",
    description: "Chèque bancaire à l'ordre d'Easy2Book",
  },
]

export function WalletRechargeForm({
  agencyId: _agencyId,
  userId: _userId,
  paymeeAvailable = false,
}: WalletRechargeFormProps) {
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [method, setMethod] = useState<RechargeMethodType | "">("")
  const [amount, setAmount] = useState("")
  const [paymentReference, setPaymentReference] = useState("")
  const [note, setNote] = useState("")

  const [onlineAmount, setOnlineAmount] = useState("")
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [isOnlinePending, startOnlineTransition] = useTransition()

  function handleOnlinePay() {
    setOnlineError(null)
    const num = parseFloat(onlineAmount)
    if (!num || num <= 0) {
      setOnlineError("Veuillez saisir un montant valide")
      return
    }
    startOnlineTransition(async () => {
      const result = await initiateOnlineRecharge({ amount: num })
      if (result.ok) {
        window.location.href = result.data.redirectUrl
      } else {
        setOnlineError(result.error)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!method) {
      setError("Veuillez sélectionner un mode de paiement")
      return
    }

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError("Veuillez saisir un montant valide")
      return
    }

    startTransition(async () => {
      const result = await submitRechargeRequest({
        amount: numAmount,
        method: method as RechargeMethodType,
        paymentReference: paymentReference || undefined,
        note: note || undefined,
      })

      if (result.ok) {
        setSuccess(true)
        setAmount("")
        setPaymentReference("")
        setNote("")
        setMethod("")
        // Reset success message after 5s
        setTimeout(() => setSuccess(false), 5000)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Section : Paiement en ligne Paymee */}
      {paymeeAvailable && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-blue-800 dark:text-blue-200">
              Payer en ligne par carte bancaire
            </span>
          </div>
          <p className="mb-4 text-sm text-blue-700 dark:text-blue-300">
            Recharge instantanée — vous serez redirigé vers notre interface de
            paiement sécurisée. Votre wallet est crédité automatiquement dès
            confirmation.
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Input
                type="number"
                step="0.001"
                min="1"
                max="999999"
                placeholder="Montant (ex: 5000.000)"
                value={onlineAmount}
                onChange={(e) => setOnlineAmount(e.target.value)}
                className="pr-12"
              />
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                TND
              </span>
            </div>
            <Button
              type="button"
              onClick={handleOnlinePay}
              disabled={isOnlinePending}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {isOnlinePending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Payer en ligne
            </Button>
          </div>
          {onlineError && (
            <p className="mt-2 text-sm text-red-600">{onlineError}</p>
          )}
        </div>
      )}

      {/* Séparateur */}
      {paymeeAvailable && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background text-muted-foreground px-2">
              ou recharge manuelle
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Méthode de paiement */}
        <div className="space-y-2">
          <Label htmlFor="method">Mode de paiement</Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as RechargeMethodType)}
          >
            <SelectTrigger id="method">
              <SelectValue placeholder="Sélectionnez un mode de paiement" />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      — {m.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Montant */}
        <div className="space-y-2">
          <Label htmlFor="amount">Montant (DT)</Label>
          <div className="relative">
            <Input
              id="amount"
              type="number"
              step="0.001"
              min="1"
              max="999999"
              placeholder="Ex: 5000.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-12"
            />
            <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
              TND
            </span>
          </div>
        </div>

        {/* Référence paiement */}
        <div className="space-y-2">
          <Label htmlFor="ref">
            Référence du paiement{" "}
            <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id="ref"
            placeholder="N° virement, n° mandat, n° chèque..."
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
          />
        </div>

        {/* Note */}
        <div className="space-y-2">
          <Label htmlFor="note">
            Note <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Textarea
            id="note"
            placeholder="Informations complémentaires..."
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Erreur */}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Succès */}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Demande de recharge soumise avec succès. Elle sera validée par un
            administrateur.
          </div>
        )}

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            "Soumettre la demande de recharge"
          )}
        </Button>

        <p className="text-muted-foreground text-xs">
          Votre demande sera traitée par un administrateur sous 24h ouvrées.
          Joignez un justificatif (photo du reçu, bordereau) pour accélérer la
          validation.
        </p>
      </form>
    </div>
  )
}
