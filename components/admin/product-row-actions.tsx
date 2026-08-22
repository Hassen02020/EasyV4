"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Edit, MoreHorizontal, Copy, Send, PauseCircle, Archive } from "lucide-react"
import { setPackageProductStatus, duplicatePackageProduct } from "@/lib/admin/packages-actions"
import { setOmraProductStatus, duplicateOmraProduct } from "@/lib/admin/omra-product-actions"
import { setActivityProductStatus, duplicateActivityProduct } from "@/lib/admin/activities-actions"

type ProductType = "package" | "omra" | "activity"

const ACTIONS: Record<ProductType, { setStatus: typeof setPackageProductStatus; duplicate: typeof duplicatePackageProduct }> = {
  package: { setStatus: setPackageProductStatus, duplicate: duplicatePackageProduct },
  omra: { setStatus: setOmraProductStatus, duplicate: duplicateOmraProduct },
  activity: { setStatus: setActivityProductStatus, duplicate: duplicateActivityProduct },
}

export function ProductRowActions({
  id,
  type,
  name,
  status,
  editPath,
}: {
  id: string
  type: ProductType
  name: string
  status: string
  /** Absent tant qu'aucune page d'édition n'existe pour ce type (ex: Attractions pour l'instant). */
  editPath?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { setStatus, duplicate } = ACTIONS[type]

  function handleSetStatus(next: string) {
    startTransition(async () => {
      const result = await setStatus(id, next)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`"${name}" — statut mis à jour.`)
      router.refresh()
    })
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicate(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`"${name}" dupliqué.`)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions pour ${name}`} disabled={isPending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {editPath ? (
          <DropdownMenuItem asChild>
            <Link href={editPath}>
              <Edit className="mr-2 h-4 w-4" />
              Modifier
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Dupliquer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {status !== "published" ? (
          <DropdownMenuItem onClick={() => handleSetStatus("published")} className="text-emerald-600">
            <Send className="mr-2 h-4 w-4" />
            Publier
          </DropdownMenuItem>
        ) : null}
        {status !== "suspended" && status !== "archived" ? (
          <DropdownMenuItem onClick={() => handleSetStatus("suspended")} className="text-amber-600">
            <PauseCircle className="mr-2 h-4 w-4" />
            Suspendre
          </DropdownMenuItem>
        ) : null}
        {status !== "archived" ? (
          <DropdownMenuItem onClick={() => handleSetStatus("archived")} className="text-gray-600">
            <Archive className="mr-2 h-4 w-4" />
            Archiver
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
