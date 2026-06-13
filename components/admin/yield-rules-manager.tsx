"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Settings, Percent, Plus, Check, X } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { upsertYieldRule, toggleYieldRule, type UpsertYieldRuleInput } from "@/lib/yield/actions"
import type { YieldRule } from "@/lib/db/schema"

interface Agency {
  id: string
  name: string
  type: string
}

interface Props {
  agencies: Agency[]
  initialRules: YieldRule[]
}

const MODULE_LABELS: Record<string, string> = {
  hotel: "Hôtels Tunisie",
  flight: "Vols",
  omra: "Omra",
  package: "Voyages Organisés",
  activity: "Activités",
  transfer: "Transferts",
  car: "Location Voiture",
}

const RULE_TYPE_LABELS: Record<string, string> = {
  percent: "Pourcentage",
  fixed: "Fixe (TND)",
  combined: "Combiné",
}

const ALL_MODULES = Object.keys(MODULE_LABELS) as UpsertYieldRuleInput["module"][]

const EMPTY_FORM: UpsertYieldRuleInput = {
  agencyId: "",
  module: "hotel",
  ruleType: "percent",
  percentValue: 10,
  fixedValueTnd: 0,
  minPriceTnd: 0,
  isActive: true,
}

export function YieldRulesManager({ agencies, initialRules }: Props) {
  const [rules, setRules] = useState<YieldRule[]>(initialRules)
  const [selectedAgency, setSelectedAgency] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<UpsertYieldRuleInput>(EMPTY_FORM)
  const [isPending, startTransition] = useTransition()

  const displayedRules =
    selectedAgency === "all"
      ? rules
      : rules.filter((r) => r.agencyId === selectedAgency)

  function agencyName(id: string) {
    return agencies.find((a) => a.id === id)?.name ?? id.slice(0, 8) + "…"
  }

  function openNew(agencyId?: string) {
    setForm({ ...EMPTY_FORM, agencyId: agencyId ?? agencies[0]?.id ?? "" })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.agencyId) {
      toast.error("Veuillez sélectionner une agence.")
      return
    }
    startTransition(async () => {
      const result = await upsertYieldRule(form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Règle de marge enregistrée.")
      setDialogOpen(false)
      // Refresh optimiste
      setRules((prev) => {
        const idx = prev.findIndex(
          (r) => r.agencyId === form.agencyId && r.module === form.module,
        )
        const updated: YieldRule = {
          id: idx >= 0 ? prev[idx]!.id : result.data.id,
          agencyId: form.agencyId,
          module: form.module,
          ruleType: form.ruleType,
          percentValue: String(form.percentValue),
          fixedValueTnd: String(form.fixedValueTnd),
          minPriceTnd: String(form.minPriceTnd),
          isActive: form.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })
    })
  }

  function handleToggle(rule: YieldRule) {
    startTransition(async () => {
      const result = await toggleYieldRule(rule.id, rule.agencyId, !rule.isActive)
      if (!result.ok) { toast.error("Erreur lors de la mise à jour."); return }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
      )
      toast.success(rule.isActive ? "Règle désactivée." : "Règle activée.")
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Agence :</Label>
          <Select value={selectedAgency} onValueChange={setSelectedAgency}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les agences</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openNew()} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle règle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Règle de marge
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Agence partenaire</Label>
                <Select
                  value={form.agencyId}
                  onValueChange={(v) => setForm((f) => ({ ...f, agencyId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Module</Label>
                  <Select
                    value={form.module}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, module: v as UpsertYieldRuleInput["module"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_MODULES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MODULE_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Type de marge</Label>
                  <Select
                    value={form.ruleType}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, ruleType: v as UpsertYieldRuleInput["ruleType"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% du prix net</SelectItem>
                      <SelectItem value="fixed">Montant fixe TND</SelectItem>
                      <SelectItem value="combined">Combiné (% + fixe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(form.ruleType === "percent" || form.ruleType === "combined") && (
                  <div className="space-y-1.5">
                    <Label>Marge %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      step={0.5}
                      value={form.percentValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, percentValue: parseFloat(e.target.value) || 0 }))
                      }
                    />
                  </div>
                )}
                {(form.ruleType === "fixed" || form.ruleType === "combined") && (
                  <div className="space-y-1.5">
                    <Label>Fixe (TND)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.fixedValueTnd}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, fixedValueTnd: parseFloat(e.target.value) || 0 }))
                      }
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Prix min (TND)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form.minPriceTnd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minPriceTnd: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rule-active"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="rule-active" className="text-sm">
                  Règle active
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isPending} className="gap-2">
                <Check className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agence</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Marge %</TableHead>
              <TableHead className="text-right">Fixe TND</TableHead>
              <TableHead className="text-right">Min TND</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  <Percent className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Aucune règle configurée.{" "}
                  <button onClick={() => openNew()} className="text-primary underline">
                    Ajouter la première règle.
                  </button>
                </TableCell>
              </TableRow>
            ) : (
              displayedRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{agencyName(rule.agencyId)}</TableCell>
                  <TableCell>{MODULE_LABELS[rule.module] ?? rule.module}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
                  </TableCell>
                  <TableCell className="text-right">
                    {rule.ruleType !== "fixed"
                      ? `${parseFloat(rule.percentValue).toFixed(2)} %`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {rule.ruleType !== "percent"
                      ? `${parseFloat(rule.fixedValueTnd).toFixed(3)} DT`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {parseFloat(rule.minPriceTnd) > 0
                      ? `${parseFloat(rule.minPriceTnd).toFixed(3)} DT`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? "default" : "secondary"}>
                      {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(rule)}
                      disabled={isPending}
                      className="h-7 w-7 p-0"
                      title={rule.isActive ? "Désactiver" : "Activer"}
                    >
                      {rule.isActive ? (
                        <X className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
