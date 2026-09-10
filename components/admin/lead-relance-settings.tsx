"use client"

/**
 * CRM / Leads — configuration de la relance (étape 3/3). Réservé à
 * super_admin/manager côté action (updateLeadRelanceSettings) — cette page
 * ne fait que masquer l'UI au reste du staff, la garde réelle est côté
 * serveur (même discipline que lead-scoring-settings.tsx).
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { BellRing, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updateLeadRelanceSettings } from "@/lib/admin/lead-relance-actions"
import type { LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"

export function LeadRelanceSettings({ initial }: { initial: LeadRelanceSettingsValue }) {
  const [settings, setSettings] = useState<LeadRelanceSettingsValue>(initial)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  function save() {
    setSaving(true)
    startTransition(() => {
      updateLeadRelanceSettings(settings)
        .then((result) => {
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success("Relance enregistrée.")
        })
        .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
        .finally(() => setSaving(false))
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" />
          Relance des demandes
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Signale les demandes restées « Nouveau » (jamais contactées) au-delà du délai — visible dans la
          liste ci-dessous, jamais un envoi automatique au client.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <label className="flex flex-1 items-center gap-2 text-sm">
            <Checkbox
              checked={settings.isEnabled}
              onCheckedChange={(c) => setSettings((s) => ({ ...s, isEnabled: c === true }))}
            />
            Activer la relance
          </label>
          <Input
            type="number"
            min={1}
            max={90}
            step={1}
            value={settings.thresholdDays}
            onChange={(e) =>
              setSettings((s) => ({ ...s, thresholdDays: Number.parseInt(e.target.value, 10) || 1 }))
            }
            className="w-24 text-right tabular-nums"
            disabled={!settings.isEnabled}
          />
          <span className="text-muted-foreground text-xs">jours sans contact</span>
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
