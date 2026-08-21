"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { addOmraReservationNote } from "@/lib/omra/reservation-actions"

export function OmraReservationNoteForm({ id }: { id: string }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    const value = note.trim()
    if (!value) {
      toast.error("La note ne peut pas être vide.")
      return
    }
    startTransition(async () => {
      const result = await addOmraReservationNote(id, value)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Note ajoutée.")
      setNote("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ajouter une note interne (visible en historique)…"
        maxLength={1000}
        rows={3}
      />
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isPending} size="sm">
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {isPending ? "Ajout…" : "Ajouter la note"}
        </Button>
      </div>
    </div>
  )
}
