"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteOmraProgram } from "@/lib/omra/admin-actions"

interface Props {
  id: string
  name: string
  /** Si fourni, navigue vers cette URL après suppression (ex: depuis la fiche). */
  redirectTo?: string
  variant?: "icon" | "button"
}

export function OmraDeleteButton({
  id,
  name,
  redirectTo,
  variant = "icon",
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteOmraProgram(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Programme « ${name} » supprimé.`)
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce programme ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le programme « {name} » et ses dates de départ seront définitivement
            supprimés. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
