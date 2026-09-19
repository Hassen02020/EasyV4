"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { reviewMutuelleRequest, type MutuelleRequestRow } from "@/lib/mutuelle/requests-actions"

const MODULE_LABELS: Record<string, string> = {
  hotel: "Hôtel Tunisie",
  hotel_monde: "Hôtel Monde",
  flight: "Vol",
  package: "Voyage organisé",
  activity: "Activité",
  transfer: "Transfert",
  omra: "Omra",
  car: "Location de voiture",
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  approved: { label: "Approuvée", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" },
  rejected: { label: "Refusée", className: "bg-red-100 text-red-700 hover:bg-red-100" },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR")
}

function ReviewRow({ request }: { request: MutuelleRequestRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState("")
  const [showNote, setShowNote] = useState<"approved" | "rejected" | null>(null)

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewMutuelleRequest({ requestId: request.id, decision, directorNote: note || undefined })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(decision === "approved" ? "Demande approuvée." : "Demande refusée.")
      setShowNote(null)
      setNote("")
      router.refresh()
    })
  }

  if (showNote) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note pour le membre (optionnel)"
          className="min-h-16 text-sm"
          disabled={isPending}
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={isPending} onClick={() => decide(showNote)} className="gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirmer
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setShowNote(null)}>
            Annuler
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        onClick={() => setShowNote("approved")}
        disabled={isPending}
      >
        <Check className="h-3.5 w-3.5" />
        Approuver
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => setShowNote("rejected")}
        disabled={isPending}
      >
        <X className="h-3.5 w-3.5" />
        Refuser
      </Button>
    </div>
  )
}

export function RequestsTable({
  requests,
  role,
}: {
  requests: MutuelleRequestRow[]
  role: "mutuelle_member" | "mutuelle_director"
}) {
  if (requests.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm">
        <p>Aucune demande pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {role === "mutuelle_director" && <TableHead>Membre</TableHead>}
            <TableHead>Prestation</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Pax</TableHead>
            <TableHead>Statut</TableHead>
            {role === "mutuelle_director" && <TableHead className="text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending!
            return (
              <TableRow key={r.id}>
                {role === "mutuelle_director" && (
                  <TableCell className="text-sm">
                    <p className="font-medium">{r.memberName ?? r.memberEmail}</p>
                    <p className="text-muted-foreground text-xs">{r.memberEmail}</p>
                  </TableCell>
                )}
                <TableCell className="text-sm">{MODULE_LABELS[r.module] ?? r.module}</TableCell>
                <TableCell className="max-w-xs text-sm">
                  <p className="line-clamp-2">{r.description}</p>
                  {r.directorNote && (
                    <p className="text-muted-foreground mt-1 text-xs italic">Note : {r.directorNote}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(r.travelStartDate)} – {formatDate(r.travelEndDate)}
                </TableCell>
                <TableCell className="text-sm">{r.paxCount}</TableCell>
                <TableCell>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </TableCell>
                {role === "mutuelle_director" && (
                  <TableCell className="text-right">
                    {r.status === "pending" ? <ReviewRow request={r} /> : null}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
