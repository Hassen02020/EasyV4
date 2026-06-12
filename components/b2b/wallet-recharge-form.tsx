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
import { Loader2, CheckCircle2 } from "lucide-react"
import {
  submitRechargeRequest,
  type RechargeMethodType,
} from "@/lib/finance/recharge-actions"

interface WalletRechargeFormProps {
  agencyId: string
  userId: string
}

const METHODS: { value: RechargeMethodType; label: string; description: string }[] = [
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

export function WalletRechargeForm({ agencyId, userId }: WalletRechargeFormProps) {
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [method, setMethod] = useState<RechargeMethodType | "">("")
  const [amount, setAmount] = useState("")
  const [paymentReference, setPaymentReference] = useState("")
  const [note, setNote] = useState("")

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
          <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
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
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Succès */}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Demande de recharge soumise avec succès. Elle sera validée par un administrateur.
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
        Joignez un justificatif (photo du reçu, bordereau) pour accélérer la validation.
      </p>
    </form>
  )
}
