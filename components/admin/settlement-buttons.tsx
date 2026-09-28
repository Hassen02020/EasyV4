"use client"

/**
 * Boutons interactifs pour la page /admin/accounting/settlements :
 *  - NewSettlementButton  — ouvre un dialogue pour créer un nouveau settlement
 *  - MarkPaidButton       — confirmation simple pour passer pending → paid
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeDollarSign, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  triggerCommissionSettlement,
  confirmSettlementPaid,
} from "@/lib/finance/settlement-actions"

/* -------------------------------------------------------------------------- */
/* NewSettlementButton                                                          */
/* -------------------------------------------------------------------------- */

export function NewSettlementButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    setSuccessMsg(null)
    startTransition(async () => {
      const result = await triggerCommissionSettlement(periodStart, periodEnd, notes || undefined)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.entryCount === 0) {
        setSuccessMsg("Settlement créé (0 entrée — aucune commission non settlée sur cette période).")
      } else {
        setSuccessMsg(
          `Settlement créé — ${result.entryCount} entrée(s), ${result.totalAmount.toLocaleString("fr-FR")} DT.`,
        )
      }
      router.refresh()
    })
  }

  const isValid = periodStart && periodEnd && periodStart < periodEnd

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setError(null)
          setSuccessMsg(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <BadgeDollarSign className="h-4 w-4" />
          Nouveau settlement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un settlement de commissions</DialogTitle>
          <DialogDescription>
            Agrège toutes les entrées commission non settlées sur la période sélectionnée et crée un
            enregistrement comptable. L&apos;opération est idempotente : si aucune entrée non settlée
            n&apos;existe, un settlement vide (0 DT) est quand même créé comme trace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="settle-start">Début de période</Label>
              <Input
                id="settle-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-end">Fin de période</Label>
              <Input
                id="settle-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-notes">Notes internes (optionnel)</Label>
            <Textarea
              id="settle-notes"
              placeholder="Ex : Settlement T3 2026 — virement SWIFT du 01/10/2026"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {successMsg && (
            <Alert>
              <AlertDescription>{successMsg}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Créer le settlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* MarkPaidButton                                                               */
/* -------------------------------------------------------------------------- */

export function MarkPaidButton({ settlementId }: { settlementId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmSettlementPaid(settlementId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          Marquer payé
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer le virement effectué</DialogTitle>
          <DialogDescription>
            Passe ce settlement de <strong>pending</strong> → <strong>paid</strong>. À effectuer
            uniquement APRÈS confirmation que le virement réel a été réalisé. Action irréversible.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmer le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
