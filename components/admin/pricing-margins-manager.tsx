"use client"

/**
 * Marges de vente — vue cross-agence super_admin (`/admin/marges`),
 * gère la table `pricing_margins` (réellement utilisée par `applyMargin()`
 * dans le flux de réservation, voir lib/pro/margins-core.ts) — remplace la
 * précédente gestion de `yieldRules`, sans aucun effet sur un prix réel.
 * Adapté de components/admin/yield-rules-manager.tsx, en plus simple :
 * `pricing_margins` n'a que 2 types de marge (pas de "combined") ni de
 * prix plancher.
 */

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
import { upsertAgencyPricingMargin, type AdminMarginActionInput } from "@/lib/pro/margins-actions"
import type { PricingMargin } from "@/lib/db/schema"

interface Agency {
  id: string
  name: string
  type: string
}

interface Props {
  agencies: Agency[]
  initialMargins: PricingMargin[]
}

// omra/package/activity retirés : ces modules n'ont pas de coût net séparé
// du prix de vente — voir lib/pro/pricing.ts (commentaire MarginModule).
const MODULE_LABELS: Record<string, string> = {
  hotel: "Hôtels Tunisie",
  flight: "Vols",
  transfer: "Transferts",
}

const ALL_MODULES = Object.keys(MODULE_LABELS) as AdminMarginActionInput["module"][]

const EMPTY_FORM: AdminMarginActionInput = {
  agencyId: "",
  module: "hotel",
  marginType: "percent",
  marginValue: 10,
  isActive: true,
}

export function PricingMarginsManager({ agencies, initialMargins }: Props) {
  const [margins, setMargins] = useState<PricingMargin[]>(initialMargins)
  const [selectedAgency, setSelectedAgency] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AdminMarginActionInput>(EMPTY_FORM)
  const [isPending, startTransition] = useTransition()

  const displayed =
    selectedAgency === "all" ? margins : margins.filter((m) => m.agencyId === selectedAgency)

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
      const result = await upsertAgencyPricingMargin(form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Marge enregistrée.")
      setDialogOpen(false)
      setMargins((prev) => {
        const idx = prev.findIndex((m) => m.agencyId === form.agencyId && m.module === form.module)
        const updated: PricingMargin = {
          id: idx >= 0 ? prev[idx]!.id : result.id,
          agencyId: form.agencyId,
          module: form.module,
          marginType: form.marginType,
          marginValue: String(form.marginValue),
          isActive: form.isActive,
          notes: idx >= 0 ? prev[idx]!.notes : null,
          createdAt: idx >= 0 ? prev[idx]!.createdAt : new Date(),
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

  function handleToggle(margin: PricingMargin) {
    startTransition(async () => {
      const result = await upsertAgencyPricingMargin({
        agencyId: margin.agencyId,
        module: margin.module as AdminMarginActionInput["module"],
        marginType: margin.marginType as "percent" | "fixed",
        marginValue: Number.parseFloat(margin.marginValue),
        isActive: !margin.isActive,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setMargins((prev) => prev.map((m) => (m.id === margin.id ? { ...m, isActive: !m.isActive } : m)))
      toast.success(margin.isActive ? "Marge désactivée." : "Marge activée.")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Agence :</Label>
          <Select value={selectedAgency} onValueChange={setSelectedAgency}>
            <SelectTrigger className="w-56 max-w-full">
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
              Nouvelle marge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Marge de vente
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Agence partenaire</Label>
                <Select value={form.agencyId} onValueChange={(v) => setForm((f) => ({ ...f, agencyId: v }))}>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Module</Label>
                  <Select
                    value={form.module}
                    onValueChange={(v) => setForm((f) => ({ ...f, module: v as AdminMarginActionInput["module"] }))}
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
                    value={form.marginType}
                    onValueChange={(v) => setForm((f) => ({ ...f, marginType: v as "percent" | "fixed" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% du prix net</SelectItem>
                      <SelectItem value="fixed">Montant fixe TND</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{form.marginType === "percent" ? "Marge %" : "Fixe (TND)"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={form.marginType === "percent" ? 200 : undefined}
                  step={0.5}
                  value={form.marginValue}
                  onChange={(e) => setForm((f) => ({ ...f, marginValue: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="margin-active"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="margin-active" className="text-sm">
                  Marge active
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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agence</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Valeur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Percent className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Aucune marge configurée.{" "}
                  <button onClick={() => openNew()} className="text-primary underline">
                    Ajouter la première.
                  </button>
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((margin) => (
                <TableRow key={margin.id}>
                  <TableCell className="font-medium">{agencyName(margin.agencyId)}</TableCell>
                  <TableCell>{MODULE_LABELS[margin.module] ?? margin.module}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {margin.marginType === "percent" ? "Pourcentage" : "Fixe (TND)"}
                  </TableCell>
                  <TableCell className="text-right">
                    {margin.marginType === "percent"
                      ? `${parseFloat(margin.marginValue).toFixed(2)} %`
                      : `${parseFloat(margin.marginValue).toFixed(2)} DT`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={margin.isActive ? "default" : "secondary"}>
                      {margin.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(margin)}
                      disabled={isPending}
                      className="h-7 w-7 p-0"
                      title={margin.isActive ? "Désactiver" : "Activer"}
                    >
                      {margin.isActive ? (
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
