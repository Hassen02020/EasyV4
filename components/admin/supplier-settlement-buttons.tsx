"use client"

/**
 * SUPPLIER-SETTLEMENT-ADMIN-UI-01 — boutons interactifs pour
 * /admin/suppliers/nodes/[id]/settlements. Même patron que
 * `components/admin/settlement-buttons.tsx` (commission settlements) :
 * chaque action est un petit Dialog autonome avec son propre
 * useState/useTransition, erreur affichée inline, `router.refresh()` après
 * succès. Toute validation d'intégrité (anti-net-négatif, garde-fous
 * anti-mélange fournisseurs, transitions d'état) vit déjà dans les
 * fonctions SQL (drizzle/manual/0135) — ces composants se contentent de
 * collecter l'input et d'afficher l'erreur renvoyée par le wrapper serveur
 * si une garde SQL rejette l'opération.
 */

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  triggerSupplierSettlement,
  confirmSupplierSettlementAction,
  cancelSupplierSettlementAction,
  requestSupplierSettlementCorrectionAction,
  requestSupplierSettlementReversalAction,
} from "@/lib/finance/supplier-settlement-actions"
import type { SupplierDueEntitlement } from "@/lib/finance/supplier-settlement"
import { getEligibleSupplierDebts } from "@/lib/finance/supplier-settlement-ui"

/* -------------------------------------------------------------------------- */
/* DeclareSettlementDialog                                                     */
/* -------------------------------------------------------------------------- */

export function DeclareSettlementDialog({
  supplierNodeId,
  debts,
}: {
  supplierNodeId: string
  debts: SupplierDueEntitlement[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [proofReference, setProofReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const eligible = getEligibleSupplierDebts(debts)

  function toggle(entitlementId: string, defaultAmount: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entitlementId)) {
        next.delete(entitlementId)
      } else {
        next.add(entitlementId)
        setAmounts((a) => ({
          ...a,
          [entitlementId]: a[entitlementId] ?? defaultAmount,
        }))
      }
      return next
    })
  }

  const missingReviewNote = eligible.some(
    (d) =>
      selected.has(d.entitlementId) &&
      d.disputedCancellation &&
      !reviewNotes[d.entitlementId]?.trim(),
  )

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const entries = eligible
        .filter((d) => selected.has(d.entitlementId))
        .map((d) => ({
          entitlementId: d.entitlementId,
          amount: Number.parseFloat(amounts[d.entitlementId] ?? d.remaining),
          cancellationReviewNote:
            reviewNotes[d.entitlementId]?.trim() || undefined,
        }))
      const result = await triggerSupplierSettlement(
        supplierNodeId,
        entries,
        proofReference.trim() || null,
        notes.trim() || null,
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setSelected(new Set())
      setAmounts({})
      setReviewNotes({})
      setProofReference("")
      setNotes("")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <div className="flex flex-col items-end gap-1.5">
        <DialogTrigger asChild>
          <Button className="gap-2" disabled={eligible.length === 0}>
            <CheckCircle2 className="h-4 w-4" />
            Déclarer un règlement
          </Button>
        </DialogTrigger>
        {eligible.length === 0 && (
          <p className="text-muted-foreground max-w-[220px] text-right text-xs">
            Désactivé : aucune créance avec un reste à payer pour ce
            fournisseur.
          </p>
        )}
      </div>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Déclarer un règlement fournisseur</DialogTitle>
          <DialogDescription>
            Sélectionnez les créances réglées par ce virement/paiement. Montant
            pré-rempli au reste dû, modifiable. Une réservation
            annulée/remboursée exige une note de vérification avant d&apos;être
            incluse.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
          {eligible.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune créance avec un reste à payer.
            </p>
          ) : (
            eligible.map((d) => (
              <div key={d.entitlementId} className="rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(d.entitlementId)}
                    onCheckedChange={() => toggle(d.entitlementId, d.remaining)}
                    disabled={isPending}
                  />
                  <div className="flex-1 space-y-1">
                    <p className="font-mono text-xs">
                      Créance {d.entitlementId.slice(0, 8)} · réservation{" "}
                      {d.reservationId.slice(0, 8)}
                      {d.disputedCancellation && (
                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                          ({d.reservationStatus})
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Reste dû : <strong>{d.remaining} TND</strong> (dette
                      reconnue {d.recognizedDebt} TND)
                    </p>
                    {selected.has(d.entitlementId) && (
                      <div className="space-y-2 pt-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={amounts[d.entitlementId] ?? d.remaining}
                          onChange={(e) =>
                            setAmounts((a) => ({
                              ...a,
                              [d.entitlementId]: e.target.value,
                            }))
                          }
                          disabled={isPending}
                          className="h-8 w-40"
                        />
                        {d.disputedCancellation && (
                          <Textarea
                            placeholder="Note de vérification obligatoire (réservation annulée/remboursée)"
                            value={reviewNotes[d.entitlementId] ?? ""}
                            onChange={(e) =>
                              setReviewNotes((n) => ({
                                ...n,
                                [d.entitlementId]: e.target.value,
                              }))
                            }
                            disabled={isPending}
                            rows={2}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ss-proof">Référence de preuve (optionnel)</Label>
            <Input
              id="ss-proof"
              value={proofReference}
              onChange={(e) => setProofReference(e.target.value)}
              disabled={isPending}
              placeholder="Ex : virement SWIFT #..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-notes">Notes internes (optionnel)</Label>
            <Input
              id="ss-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selected.size === 0 || missingReviewNote || isPending}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Déclarer ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Petit bouton de confirmation générique (confirm / annuler)                 */
/* -------------------------------------------------------------------------- */

function SimpleConfirmButton({
  label,
  title,
  description,
  icon,
  variant = "outline",
  action,
}: {
  label: string
  title: string
  description: string
  icon: ReactNode
  variant?: "outline" | "destructive"
  action: () => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "Erreur inconnue")
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="gap-1.5">
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Fermer
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            variant={variant === "destructive" ? "destructive" : "default"}
            className="gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmSettlementButton({
  settlementId,
}: {
  settlementId: string
}) {
  return (
    <SimpleConfirmButton
      label="Confirmer"
      title="Confirmer le règlement"
      description="Passe ce règlement en statut payé — à effectuer uniquement après confirmation du virement/paiement réel. Action irréversible (seule une réversion ultérieure peut l'annuler comptablement)."
      icon={<CheckCircle2 className="h-4 w-4" />}
      action={() => confirmSupplierSettlementAction(settlementId)}
    />
  )
}

export function CancelSettlementButton({
  settlementId,
}: {
  settlementId: string
}) {
  return (
    <SimpleConfirmButton
      label="Annuler"
      title="Annuler cette déclaration"
      description="Annule un règlement pas encore payé (pending/declared) et libère la créance pour une nouvelle déclaration. Action irréversible."
      icon={<XCircle className="h-4 w-4" />}
      variant="destructive"
      action={() => cancelSupplierSettlementAction(settlementId)}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* ReverseSettlementDialog                                                     */
/* -------------------------------------------------------------------------- */

const REVERSAL_CAUSE_LABEL: Record<string, string> = {
  rejected_payment: "Paiement rejeté par la banque",
  erroneous_confirmation: "Confirmation erronée",
  duplicate_payment: "Paiement en double",
  other: "Autre",
}

export function ReverseSettlementDialog({
  settlementId,
}: {
  settlementId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cause, setCause] = useState<string>("")
  const [reference, setReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await requestSupplierSettlementReversalAction(
        settlementId,
        cause as
          | "rejected_payment"
          | "erroneous_confirmation"
          | "duplicate_payment"
          | "other",
        reference.trim() || null,
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setCause("")
      setReference("")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" className="gap-1.5">
          <Undo2 className="h-4 w-4" />
          Réverser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réverser ce règlement payé</DialogTitle>
          <DialogDescription>
            Annulation comptable d&apos;un règlement invalide — le montant est
            toujours calculé automatiquement (jamais saisi). Les remboursements
            réels liés sont cascadés automatiquement ; les corrections
            comptables (erreur de calcul/doublon) ne le sont jamais. Action
            irréversible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Cause</Label>
            <Select value={cause} onValueChange={setCause} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une cause" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REVERSAL_CAUSE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rev-ref">Référence (optionnel)</Label>
            <Input
              id="rev-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Fermer
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!cause || isPending}
            variant="destructive"
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="h-4 w-4" />
            )}
            Réverser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* RefundEntryDialog — remboursement réel ciblant un règlement payé précis    */
/* -------------------------------------------------------------------------- */

export function RefundEntryDialog({
  entitlementId,
  targetSettlementId,
}: {
  entitlementId: string
  targetSettlementId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [externalReference, setExternalReference] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    const parsed = Number.parseFloat(amount)
    startTransition(async () => {
      const result = await requestSupplierSettlementCorrectionAction(
        entitlementId,
        targetSettlementId,
        "supplier_refund",
        -Math.abs(parsed),
        externalReference.trim() || null,
        reviewNote.trim() || null,
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setAmount("")
      setExternalReference("")
      setReviewNote("")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Undo2 className="h-4 w-4" />
          Rembourser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déclarer un remboursement réel</DialogTitle>
          <DialogDescription>
            Encaissement réel reçu du fournisseur sur cette créance précise.
            Plafonné au net réellement décaissé (ne peut jamais rendre le net
            négatif) — vérifié au moment de la déclaration ET de la
            confirmation. Référence externe obligatoire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rf-amount">Montant remboursé (TND)</Label>
            <Input
              id="rf-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-ref">Référence externe (obligatoire)</Label>
            <Input
              id="rf-ref"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-note">Note de vérification (optionnel)</Label>
            <Textarea
              id="rf-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              disabled={isPending}
              rows={2}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Fermer
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !externalReference.trim() ||
              !amount ||
              Number.parseFloat(amount) <= 0 ||
              isPending
            }
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Déclarer le remboursement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* CorrectDebtDialog — correction comptable (erreur de calcul / doublon)      */
/* -------------------------------------------------------------------------- */

const CORRECTION_CAUSE_LABEL: Record<string, string> = {
  calculation_error: "Erreur de calcul",
  duplicate_entry: "Entrée en double",
}

export function CorrectDebtDialog({
  entitlementId,
}: {
  entitlementId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cause, setCause] = useState<string>("")
  const [amount, setAmount] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await requestSupplierSettlementCorrectionAction(
        entitlementId,
        null,
        cause as "calculation_error" | "duplicate_entry",
        Number.parseFloat(amount),
        null,
        reviewNote.trim() || null,
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setCause("")
      setAmount("")
      setReviewNote("")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          Corriger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correction comptable</DialogTitle>
          <DialogDescription>
            Ajuste la dette reconnue de cette créance — jamais un flux de
            trésorerie réel. Montant positif = augmente la dette reconnue,
            négatif = la diminue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Cause</Label>
            <Select value={cause} onValueChange={setCause} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une cause" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CORRECTION_CAUSE_LABEL).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-amount">Montant (TND, signé)</Label>
            <Input
              id="cd-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-note">Note de vérification (optionnel)</Label>
            <Textarea
              id="cd-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              disabled={isPending}
              rows={2}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Fermer
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!cause || !amount || isPending}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Déclarer la correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
