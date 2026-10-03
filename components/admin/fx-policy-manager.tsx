"use client"

/**
 * FX-ADMIN-01 — Interface de gestion des politiques FX.
 * Crée / désactive des entrées dans `fx_policies`.
 * Accessible super_admin uniquement.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createFxPolicy,
  deactivateFxPolicy,
  type CorrectionMode,
  type BankFeeMode,
  type CreateFxPolicyInput,
} from "@/lib/finance/fx-policy-actions"
import type { FxPolicy } from "@/lib/finance/fx-policy"

const CORRECTION_MODE_LABELS: Record<CorrectionMode, string> = {
  NONE: "Aucune correction (taux mid-market)",
  PERCENTAGE: "Pourcentage (%)",
  FIXED_SPREAD: "Spread fixe (+ valeur absolue)",
  FIXED_RATE: "Taux fixe (remplace le taux mid-market)",
}

const BANK_FEE_MODE_LABELS: Record<BankFeeMode, string> = {
  NONE: "Aucun frais bancaire",
  FIXED: "Fixe (montant TND)",
  PERCENTAGE: "Pourcentage du montant TND converti",
  MIN_MAX: "Pourcentage avec plancher/plafond TND",
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d)
}

function isActive(policy: FxPolicy): boolean {
  const now = new Date()
  return (
    policy.effectiveFrom <= now &&
    (policy.effectiveTo === null || policy.effectiveTo > now)
  )
}

interface FxPolicyManagerProps {
  initial: FxPolicy[]
}

export function FxPolicyManager({ initial }: FxPolicyManagerProps) {
  const [policies, setPolicies] = useState<FxPolicy[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [correctionMode, setCorrectionMode] =
    useState<CorrectionMode>("NONE")
  const [correctionValue, setCorrectionValue] = useState("0")
  const [bankFeeMode, setBankFeeMode] = useState<BankFeeMode>("NONE")
  const [bankFeeFixed, setBankFeeFixed] = useState("")
  const [bankFeePercent, setBankFeePercent] = useState("")
  const [bankFeeMin, setBankFeeMin] = useState("")
  const [bankFeeMax, setBankFeeMax] = useState("")
  const [note, setNote] = useState("")

  function resetForm() {
    setCorrectionMode("NONE")
    setCorrectionValue("0")
    setBankFeeMode("NONE")
    setBankFeeFixed("")
    setBankFeePercent("")
    setBankFeeMin("")
    setBankFeeMax("")
    setNote("")
  }

  function handleCreate() {
    const input: CreateFxPolicyInput = {
      correctionMode,
      correctionValue: Number(correctionValue),
      bankFeeMode,
      bankFeeFixed: bankFeeFixed !== "" ? Number(bankFeeFixed) : null,
      bankFeePercent: bankFeePercent !== "" ? Number(bankFeePercent) : null,
      bankFeeMin: bankFeeMin !== "" ? Number(bankFeeMin) : null,
      bankFeeMax: bankFeeMax !== "" ? Number(bankFeeMax) : null,
      note: note.trim() || null,
    }

    startTransition(async () => {
      const result = await createFxPolicy(input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Politique FX créée avec succès")
      resetForm()
      setShowForm(false)
      // Rafraîchir la liste via router.refresh() ne fonctionnerait pas ici
      // sans router — on recharge simplement la page pour refléter l'état DB.
      window.location.reload()
    })
  }

  function handleDeactivate(id: string) {
    startTransition(async () => {
      const result = await deactivateFxPolicy(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Politique désactivée")
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, effectiveTo: new Date() } : p,
        ),
      )
    })
  }

  const activeCount = policies.filter(isActive).length

  return (
    <div className="space-y-6">
      {/* En-tête + bouton création */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {policies.length} politique{policies.length !== 1 ? "s" : ""} —{" "}
            <span className="text-emerald-600 font-medium">
              {activeCount} active{activeCount !== 1 ? "s" : ""}
            </span>
          </span>
          {activeCount === 0 && (
            <Badge variant="destructive" className="text-xs">
              CRITIQUE : aucune politique active — les bookings non-TND échouent
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? (
            <>
              <ChevronUp className="mr-1 h-4 w-4" />
              Annuler
            </>
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" />
              Nouvelle politique
            </>
          )}
        </Button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="bg-muted/30 border rounded-lg p-5 space-y-5">
          <h2 className="font-semibold">Créer une nouvelle politique FX</h2>

          {/* Correction du taux */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-2">
              Correction du taux de référence
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Mode de correction</Label>
                <Select
                  value={correctionMode}
                  onValueChange={(v) => setCorrectionMode(v as CorrectionMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CORRECTION_MODE_LABELS).map(
                      ([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              {correctionMode !== "NONE" && (
                <div className="space-y-1.5">
                  <Label>
                    Valeur{" "}
                    {correctionMode === "PERCENTAGE"
                      ? "(%)"
                      : correctionMode === "FIXED_RATE"
                        ? "(TND)"
                        : "(spread)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={correctionValue}
                    onChange={(e) => setCorrectionValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          </fieldset>

          {/* Frais bancaire */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-2">
              Frais bancaire FX
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Mode frais</Label>
                <Select
                  value={bankFeeMode}
                  onValueChange={(v) => setBankFeeMode(v as BankFeeMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BANK_FEE_MODE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bankFeeMode === "FIXED" && (
                <div className="space-y-1.5">
                  <Label>Montant fixe (TND)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bankFeeFixed}
                    onChange={(e) => setBankFeeFixed(e.target.value)}
                    placeholder="ex : 8.00"
                  />
                </div>
              )}
              {(bankFeeMode === "PERCENTAGE" || bankFeeMode === "MIN_MAX") && (
                <div className="space-y-1.5">
                  <Label>Pourcentage (%)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={bankFeePercent}
                    onChange={(e) => setBankFeePercent(e.target.value)}
                    placeholder="ex : 0.5"
                  />
                </div>
              )}
            </div>
            {bankFeeMode === "MIN_MAX" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plancher (TND)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bankFeeMin}
                    onChange={(e) => setBankFeeMin(e.target.value)}
                    placeholder="ex : 5.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Plafond (TND)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bankFeeMax}
                    onChange={(e) => setBankFeeMax(e.target.value)}
                    placeholder="ex : 50.00"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note interne (optionnel)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contexte, décision Direction, date d'effet souhaitée…"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? "Enregistrement…" : "Créer la politique"}
            </Button>
          </div>
        </div>
      )}

      {/* Liste */}
      {policies.length === 0 ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <p className="text-destructive font-semibold">
            Aucune politique FX en base
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Créez une politique pour débloquer les confirmations de vol
            non-TND (Duffel EUR/USD).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...policies].reverse().map((policy) => {
            const active = isActive(policy)
            return (
              <div
                key={policy.id}
                className={`rounded-lg border p-4 ${
                  active
                    ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
                    : "border-border bg-muted/20 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">
                        v{policy.version}
                      </span>
                      {active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <XCircle className="mr-1 h-3 w-3" />
                          Désactivée
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm space-y-0.5">
                      <p>
                        <span className="text-muted-foreground">
                          Correction :{" "}
                        </span>
                        <strong>
                          {CORRECTION_MODE_LABELS[policy.correctionMode]}
                        </strong>
                        {policy.correctionMode !== "NONE" && (
                          <span className="ml-1 font-mono">
                            {policy.correctionValue}
                          </span>
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">
                          Frais bancaire :{" "}
                        </span>
                        <strong>
                          {BANK_FEE_MODE_LABELS[policy.bankFeeMode]}
                        </strong>
                        {policy.bankFeeMode === "FIXED" &&
                          policy.bankFeeFixed !== null && (
                            <span className="ml-1 font-mono">
                              {policy.bankFeeFixed} TND
                            </span>
                          )}
                        {(policy.bankFeeMode === "PERCENTAGE" ||
                          policy.bankFeeMode === "MIN_MAX") &&
                          policy.bankFeePercent !== null && (
                            <span className="ml-1 font-mono">
                              {policy.bankFeePercent}%
                            </span>
                          )}
                        {policy.bankFeeMode === "MIN_MAX" && (
                          <span className="ml-1 text-muted-foreground">
                            [{policy.bankFeeMin ?? "−"} –{" "}
                            {policy.bankFeeMax ?? "∞"} TND]
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <Clock className="h-3 w-3" />
                      <span>depuis {fmt(policy.effectiveFrom)}</span>
                      {policy.effectiveTo && (
                        <span>→ désactivée {fmt(policy.effectiveTo)}</span>
                      )}
                    </div>
                    {policy.note && (
                      <p className="text-xs text-muted-foreground italic mt-1">
                        {policy.note}
                      </p>
                    )}
                  </div>
                  {active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={isPending}
                      onClick={() => handleDeactivate(policy.id)}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      Désactiver
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
