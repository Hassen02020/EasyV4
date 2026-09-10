"use client"

/**
 * CRM / Leads — configuration du scoring (étape 2/3). Réservé à
 * super_admin/manager côté action (updateLeadScoreRule) — cette page ne
 * fait que masquer l'UI au reste du staff, la garde réelle est côté
 * serveur (même discipline que margins-form.tsx / pricing-margins-manager.tsx).
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Settings2, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updateLeadScoreRule } from "@/lib/admin/lead-scoring-actions"
import {
  LEAD_SCORE_SIGNALS,
  LEAD_SCORE_SIGNAL_LABELS,
  type LeadScoreRuleMap,
  type LeadScoreSignal,
} from "@/lib/crm/lead-scoring-core"

export function LeadScoringSettings({ initial }: { initial: LeadScoreRuleMap }) {
  const [rules, setRules] = useState<LeadScoreRuleMap>(initial)
  const [savingSignal, setSavingSignal] = useState<LeadScoreSignal | null>(null)
  const [, startTransition] = useTransition()

  function updateLocal(signal: LeadScoreSignal, patch: Partial<{ points: number; isActive: boolean }>) {
    setRules((prev) => ({ ...prev, [signal]: { ...prev[signal], ...patch } }))
  }

  function save(signal: LeadScoreSignal) {
    setSavingSignal(signal)
    const rule = rules[signal]
    startTransition(() => {
      updateLeadScoreRule({ signal, points: rule.points, isActive: rule.isActive })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success("Pondération enregistrée.")
        })
        .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
        .finally(() => setSavingSignal(null))
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4" />
          Pondération du score des demandes
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          4 signaux fixes, objectivement vérifiables sur chaque demande — le score est toujours la somme
          transparente des signaux actifs qui matchent.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {LEAD_SCORE_SIGNALS.map((signal) => {
          const rule = rules[signal]
          const saving = savingSignal === signal
          return (
            <div key={signal} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <Checkbox
                  checked={rule.isActive}
                  onCheckedChange={(c) => updateLocal(signal, { isActive: c === true })}
                />
                {LEAD_SCORE_SIGNAL_LABELS[signal]}
              </label>
              <Input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={rule.points}
                onChange={(e) => updateLocal(signal, { points: Number.parseInt(e.target.value, 10) || 0 })}
                className="w-24 text-right tabular-nums"
                disabled={!rule.isActive}
              />
              <span className="text-muted-foreground text-xs">points</span>
              <Button size="sm" variant="outline" onClick={() => save(signal)} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
