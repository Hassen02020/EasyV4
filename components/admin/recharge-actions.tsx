"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import {
  validateRechargeRequest,
  rejectRechargeRequest,
} from "@/lib/finance/recharge-actions"

interface AdminRechargeActionsProps {
  requestId: string
  adminUserId: string
  amount: number
  agencyName: string
}

function formatTnd(v: number) {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

export function AdminRechargeActions({
  requestId,
  adminUserId,
  amount,
  agencyName,
}: AdminRechargeActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function handleValidate() {
    setError(null)
    startTransition(async () => {
      const result = await validateRechargeRequest({
        requestId,
        reviewedByUserId: adminUserId,
      })
      if (!result.ok) {
        setError(result.error)
      }
    })
  }

  function handleReject() {
    if (!rejectionReason.trim()) {
      setError("Le motif de refus est obligatoire")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await rejectRechargeRequest({
        requestId,
        reviewedByUserId: adminUserId,
        rejectionReason: rejectionReason.trim(),
      })
      if (!result.ok) {
        setError(result.error)
      } else {
        setRejectOpen(false)
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}

      {/* Validate */}
      <Button
        size="sm"
        variant="default"
        onClick={handleValidate}
        disabled={isPending}
        className="gap-1"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        Valider
      </Button>

      {/* Reject */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={isPending} className="gap-1">
            <XCircle className="h-3 w-3" />
            Refuser
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la recharge</DialogTitle>
            <DialogDescription>
              Refuser la demande de recharge de {formatTnd(amount)} DT pour{" "}
              <strong>{agencyName}</strong>. Le wallet ne sera pas crédité.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motif du refus</label>
            <Input
              placeholder="Ex: Bordereau non conforme, montant incorrect..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
