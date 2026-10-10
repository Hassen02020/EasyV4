"use client"

/**
 * CRM / Customer 360 — panneau agrégé déclenché depuis une ligne de
 * LeadsTable. Charge à l'ouverture (pas de prefetch pour toutes les
 * lignes) via getCustomer360 (lib/admin/inbox-actions.ts).
 */

import { useState } from "react"
import { toast } from "sonner"
import {
  Calendar,
  Loader2,
  Mail,
  MessageSquare,
  NotebookPen,
  Phone,
  User,
  Star,
  TrendingUp,
  Receipt,
  Gift,
  MessageCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getCustomer360 } from "@/lib/admin/inbox-actions"
import type { Customer360 } from "@/lib/admin/customer-360-core"

const VIP_SIGNAL_LABEL: Record<string, string> = {
  lead_quality: "Qualité du lead",
  recurrence: "Réservations",
  commercial_value_sale: "Chiffre d'affaires",
  commercial_value_margin: "Marge",
  recency: "Récence",
  engagement: "Demandes répétées",
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  call: "Appel",
  email: "Email",
  web: "Web",
}

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage",
  activity: "Activité",
  general: "Général",
}

const STATUS_LABEL: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  converted: "Converti",
  closed: "Clos",
}

export function Customer360Button({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Customer360 | null>(null)

  function handleOpen() {
    setOpen(true)
    setLoading(true)
    getCustomer360(leadId)
      .then((result) => {
        if (result.ok) {
          setData(result.customer360)
        } else {
          toast.error(result.error || "Échec du chargement.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleOpen}
        className="gap-1 text-xs"
      >
        <User className="h-3.5 w-3.5" />
        Vue 360
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Vue 360 — {leadName}
              </DialogTitle>
            </DialogHeader>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : !data ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Aucune donnée.
              </p>
            ) : (
              <div className="space-y-5">
                {/* CRM-360-LEAD-INFO-01 — profil de contact */}
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <User className="h-3.5 w-3.5" /> Profil
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {data.lead.phone && (
                      <>
                        <dt className="text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Téléphone
                        </dt>
                        <dd className="font-medium">{data.lead.phone}</dd>
                      </>
                    )}
                    {data.lead.email && (
                      <>
                        <dt className="text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </dt>
                        <dd className="truncate font-medium">
                          {data.lead.email}
                        </dd>
                      </>
                    )}
                    {data.lead.channel && (
                      <>
                        <dt className="text-muted-foreground">Canal</dt>
                        <dd>
                          {CHANNEL_LABEL[data.lead.channel] ??
                            data.lead.channel}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Produit</dt>
                    <dd>
                      {data.lead.productLabel ??
                        PRODUCT_LABEL[data.lead.productType] ??
                        data.lead.productType}
                    </dd>
                    <dt className="text-muted-foreground">Statut</dt>
                    <dd>
                      {STATUS_LABEL[data.lead.status] ?? data.lead.status}
                    </dd>
                    <dt className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Créé le
                    </dt>
                    <dd>
                      {new Date(data.lead.createdAt).toLocaleDateString(
                        "fr-FR",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                    </dd>
                  </dl>
                </section>

                {data.lead.message && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <MessageSquare className="h-3.5 w-3.5" /> Demande initiale
                    </h3>
                    <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                      {data.lead.message}
                    </p>
                  </section>
                )}

                {data.lead.staffNotes && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <NotebookPen className="h-3.5 w-3.5" /> Note interne
                    </h3>
                    <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                      {data.lead.staffNotes}
                    </p>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Star className="h-3.5 w-3.5" /> Score ({data.score.total})
                  </h3>
                  <ul className="grid grid-cols-2 gap-1.5 text-xs">
                    {data.score.breakdown.map((item) => (
                      <li
                        key={item.signal}
                        className="flex items-center justify-between rounded border px-2 py-1"
                      >
                        <span
                          className={
                            item.matched
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {item.label}
                        </span>
                        <span
                          className={
                            item.points > 0
                              ? "font-medium text-emerald-700"
                              : "text-muted-foreground"
                          }
                        >
                          {item.matched ? `+${item.points}` : "0"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <TrendingUp className="h-3.5 w-3.5" /> Score VIP (
                    {data.vipScore.total})
                  </h3>
                  <ul className="grid grid-cols-2 gap-1.5 text-xs">
                    {data.vipScore.breakdown.map((item) => (
                      <li
                        key={item.signal}
                        className="flex items-center justify-between rounded border px-2 py-1"
                      >
                        <span className="text-foreground">
                          {VIP_SIGNAL_LABEL[item.signal] ?? item.signal}
                        </span>
                        <span
                          className={
                            item.points > 0
                              ? "font-medium text-emerald-700"
                              : "text-muted-foreground"
                          }
                        >
                          {item.points > 0 ? `+${item.points}` : "0"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Receipt className="h-3.5 w-3.5" /> Réservations (
                    {data.reservations.length})
                  </h3>
                  {data.reservations.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Aucune réservation correspondante (email/téléphone).
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.reservations.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between rounded border px-2 py-1.5 text-xs"
                        >
                          <span>
                            <span className="font-mono font-medium">
                              {r.publicRef}
                            </span>{" "}
                            · {r.module} · {r.status}
                          </span>
                          <span className="font-semibold">
                            {parseFloat(r.tndAmount).toFixed(2)} DT
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Gift className="h-3.5 w-3.5" /> Fidélité
                  </h3>
                  {data.loyalty ? (
                    <p className="text-xs">
                      {data.loyalty.availablePoints} pts disponibles ·{" "}
                      {data.loyalty.pendingPoints} pts en attente
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Aucun compte fidélité lié à ce contact.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> Conversations (
                    {data.conversations.length})
                  </h3>
                  {data.conversations.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Aucune conversation enregistrée.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.conversations.map((c) => (
                        <li
                          key={c.id}
                          className="rounded border px-2 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">
                              {CHANNEL_LABEL[c.channel] ?? c.channel}
                            </Badge>
                            <span className="text-muted-foreground">
                              {c.lastMessageAt
                                ? new Date(c.lastMessageAt).toLocaleDateString(
                                    "fr-FR",
                                    {
                                      day: "numeric",
                                      month: "short",
                                    },
                                  )
                                : "—"}
                            </span>
                          </div>
                          {c.lastMessagePreview && (
                            <p className="text-muted-foreground mt-1">
                              {c.lastMessagePreview}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
