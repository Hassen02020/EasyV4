"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StarRow } from "@/components/reviews/star-row"
import { moderateReview } from "@/lib/admin/reviews-actions"
import type { ReviewRow, ReviewStatus } from "@/lib/reviews/reviews-core"

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Rejeté",
}

const STATUS_COLOR: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-gray-100 text-gray-600",
}

const MODULE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Attraction",
}

function ModerateActions({ review, onModerated }: { review: ReviewRow; onModerated: (status: ReviewStatus) => void }) {
  const [pending, setPending] = useState(false)

  function handle(status: "approved" | "rejected") {
    if (pending) return
    setPending(true)
    moderateReview({ id: review.id, status })
      .then((result) => {
        if (result.ok) {
          onModerated(status)
          toast.success(status === "approved" ? "Avis approuvé." : "Avis rejeté.")
        } else {
          toast.error(result.error || "Échec de la modération.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setPending(false))
  }

  return (
    <div className="flex items-center gap-2">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {review.status !== "approved" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handle("approved")}>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Approuver
            </Button>
          )}
          {review.status !== "rejected" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handle("rejected")}>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              Rejeter
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export function ReviewsModerationTable({ reviews: initial }: { reviews: ReviewRow[] }) {
  const [reviews, setReviews] = useState(initial)
  const [statusFilter, setStatusFilter] = useState("pending")

  const filtered = useMemo(() => {
    if (statusFilter === "all") return reviews
    return reviews.filter((r) => r.status === statusFilter)
  }, [reviews, statusFilter])

  function handleModerated(id: string, status: ReviewStatus) {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Commentaire</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Reçu le</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    Aucun avis ne correspond à ce filtre.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <Badge variant="outline">{MODULE_LABEL[review.module] ?? review.module}</Badge>
                    </TableCell>
                    <TableCell>
                      <StarRow rating={review.rating} size="size-3.5" />
                    </TableCell>
                    <TableCell className="max-w-80 text-sm">
                      {review.comment ? (
                        <p className="line-clamp-2">{review.comment}</p>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLOR[review.status]}>{STATUS_LABEL[review.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(review.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <ModerateActions review={review} onModerated={(status) => handleModerated(review.id, status)} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
