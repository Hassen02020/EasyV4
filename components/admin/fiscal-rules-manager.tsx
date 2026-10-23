"use client"

/**
 * Gestionnaire des règles fiscales — Super Admin uniquement pour les écritures.
 * Lecture : accounting (accounting.view).
 *
 * Fonctionnalités :
 * - Liste scrollable des règles (toutes statuts)
 * - Création d'un draft
 * - Activation (avec référence de validation obligatoire)
 * - Désactivation (fermeture)
 */

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createDraftFiscalRule,
  activateFiscalRule,
  deactivateFiscalRule,
  listFiscalRules,
  type FiscalRuleListItem,
} from "@/lib/finance/fiscal-rules-actions"

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  active: "Active",
  closed: "Fermée",
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  standard: "Standard",
  zero_rated: "Taux 0 %",
  exempt: "Exonéré",
  out_of_scope: "Hors champ",
}

const MODULES = [
  "hotel",
  "flight",
  "package",
  "activity",
  "transfer",
  "omra",
  "car",
  "hotel_monde",
  "*",
]

type Props = {
  initialRules: FiscalRuleListItem[]
  isSuperAdmin: boolean
}

export function FiscalRulesManager({ initialRules, isSuperAdmin }: Props) {
  const [rules, setRules] = useState<FiscalRuleListItem[]>(initialRules)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState<string | null>(null)
  const [validationRef, setValidationRef] = useState("")

  // Form state for create
  const [form, setForm] = useState({
    country: "TN",
    module: "hotel",
    fiscalClassification: "standard" as
      | "standard"
      | "zero_rated"
      | "exempt"
      | "out_of_scope",
    vatRate: "19",
    effectiveFrom: "",
    note: "",
  })

  async function refreshRules() {
    const result = await listFiscalRules()
    if (result.ok) setRules(result.rules)
  }

  function handleCreate() {
    setError(null)
    if (!form.effectiveFrom) {
      setError("Date d'entrée en vigueur requise")
      return
    }
    const effectiveFrom = new Date(form.effectiveFrom)
    if (effectiveFrom <= new Date()) {
      setError("La date doit être dans le futur")
      return
    }
    startTransition(async () => {
      const result = await createDraftFiscalRule({
        country: form.country,
        module: form.module,
        fiscalClassification: form.fiscalClassification,
        vatRate: parseFloat(form.vatRate),
        effectiveFrom,
        note: form.note || null,
      })
      if (result.ok) {
        setCreateOpen(false)
        setForm({
          country: "TN",
          module: "hotel",
          fiscalClassification: "standard",
          vatRate: "19",
          effectiveFrom: "",
          note: "",
        })
        await refreshRules()
      } else {
        setError(result.error)
      }
    })
  }

  function handleActivate(ruleId: string) {
    setError(null)
    if (!validationRef.trim()) {
      setError("Référence de validation requise")
      return
    }
    startTransition(async () => {
      const result = await activateFiscalRule({ ruleId, validationRef })
      if (result.ok) {
        setActivateOpen(null)
        setValidationRef("")
        await refreshRules()
      } else {
        setError(result.error)
      }
    })
  }

  function handleDeactivate(ruleId: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateFiscalRule(ruleId)
      if (result.ok) {
        await refreshRules()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Règles fiscales</h2>
          <p className="text-sm text-muted-foreground">
            Taux de TVA applicables par pays et par module.
          </p>
        </div>
        {isSuperAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">+ Nouvelle règle</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un brouillon</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Pays</Label>
                    <Input
                      value={form.country}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))
                      }
                      placeholder="TN ou *"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Label>Module</Label>
                    <Select
                      value={form.module}
                      onValueChange={(v) => setForm((f) => ({ ...f, module: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODULES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Classification</Label>
                    <Select
                      value={form.fiscalClassification}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          fiscalClassification: v as typeof form.fiscalClassification,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="zero_rated">Taux 0 %</SelectItem>
                        <SelectItem value="exempt">Exonéré</SelectItem>
                        <SelectItem value="out_of_scope">Hors champ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Taux TVA (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.vatRate}
                      onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Date d&apos;entrée en vigueur</Label>
                  <Input
                    type="datetime-local"
                    value={form.effectiveFrom}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Note (optionnel)</Label>
                  <Input
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Contexte légal, référence texte..."
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <Button onClick={handleCreate} disabled={isPending} className="w-full">
                  {isPending ? "Création..." : "Créer le brouillon"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && !createOpen && !activateOpen && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="rounded-md border overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Pays</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Taux</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Depuis</TableHead>
              <TableHead>Jusqu&apos;au</TableHead>
              {isSuperAdmin && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isSuperAdmin ? 9 : 8}
                  className="text-center text-muted-foreground py-8"
                >
                  Aucune règle fiscale configurée
                </TableCell>
              </TableRow>
            )}
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono font-medium">{rule.country}</TableCell>
                <TableCell className="font-mono">{rule.module}</TableCell>
                <TableCell>
                  {CLASSIFICATION_LABEL[rule.fiscalClassification] ??
                    rule.fiscalClassification}
                </TableCell>
                <TableCell className="tabular-nums">
                  {parseFloat(rule.vatRate).toFixed(2)} %
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[rule.status] ?? ""}`}
                  >
                    {STATUS_LABEL[rule.status] ?? rule.status}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  v{rule.version}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {rule.effectiveFrom
                    ? new Date(rule.effectiveFrom).toLocaleDateString("fr-FR")
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {rule.effectiveTo
                    ? new Date(rule.effectiveTo).toLocaleDateString("fr-FR")
                    : "—"}
                </TableCell>
                {isSuperAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      {rule.status === "draft" && (
                        <Dialog
                          open={activateOpen === rule.id}
                          onOpenChange={(o) => {
                            setActivateOpen(o ? rule.id : null)
                            if (!o) setValidationRef("")
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Activer
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Activer la règle</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                              <p className="text-sm text-muted-foreground">
                                Pays : <strong>{rule.country}</strong> — Module :{" "}
                                <strong>{rule.module}</strong> — Taux :{" "}
                                <strong>{parseFloat(rule.vatRate).toFixed(2)} %</strong>
                              </p>
                              <div>
                                <Label>Référence de validation (obligatoire)</Label>
                                <Input
                                  value={validationRef}
                                  onChange={(e) => setValidationRef(e.target.value)}
                                  placeholder="Ex : Note interne 2026-10-23, CGI Art. 60..."
                                />
                              </div>
                              {error && activateOpen === rule.id && (
                                <p className="text-sm text-red-600">{error}</p>
                              )}
                              <Button
                                onClick={() => handleActivate(rule.id)}
                                disabled={isPending}
                                className="w-full"
                              >
                                {isPending ? "Activation..." : "Confirmer l'activation"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      {rule.status === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDeactivate(rule.id)}
                        >
                          Fermer
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
