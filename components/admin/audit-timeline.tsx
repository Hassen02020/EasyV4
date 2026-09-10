/**
 * Timeline d'audit générique — rend une liste d'événements `audit_events`.
 *
 * Réutilisée par la page détail réservation (admin + pro) ET par
 * `/admin/logs` (flux système récent) pour éviter deux implémentations de
 * rendu divergentes du même concept.
 */

import { History } from "lucide-react"

export interface AuditTimelineEntry {
  id: string
  action: string
  actorName: string | null
  diff: unknown
  createdAt: string
}

const ACTION_LABEL: Record<string, string> = {
  "payment.captured": "Paiement encaissé",
  "payment.refunded": "Remboursement",
  "reservation.status_changed": "Changement de statut",
  "reservation.created": "Réservation créée",
  "notification.whatsapp.sent": "WhatsApp envoyé",
  "notification.whatsapp.failed": "Échec WhatsApp",
  "crm.sync.sent": "Synchronisation CRM",
}

function formatDiff(diff: unknown): string | null {
  if (!diff || typeof diff !== "object") return null
  try {
    const entries = Object.entries(diff as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    return entries.length > 0 ? entries.join(" · ") : null
  } catch {
    return null
  }
}

export function AuditTimeline({ entries }: { entries: AuditTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <History className="h-4 w-4" />
        Aucun événement d&apos;audit pour cet élément.
      </div>
    )
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const diffLabel = formatDiff(entry.diff)
        return (
          <li key={entry.id} className="border-border flex gap-3 border-l-2 pl-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-sm font-medium">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(entry.createdAt).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <div className="text-muted-foreground text-xs">
                {entry.actorName ?? "Système"}
              </div>
              {diffLabel && (
                <div className="text-muted-foreground mt-1 font-mono text-xs break-words">
                  {diffLabel}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
