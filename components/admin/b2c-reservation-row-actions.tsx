"use client"

import Link from "next/link"
import { CheckCircle2, Edit, Eye, MoreHorizontal, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface B2cReservationRowActionsProps {
  reservationId: string
  publicRef: string
  status: string
}

/**
 * Menu d'actions pour une ligne de app/admin/b2c/reservations — extrait en
 * Client Component dédié pour la même raison que
 * components/admin/b2c-client-row-actions.tsx : ce DropdownMenu Radix était
 * inline dans le Server Component (une instance par ligne, .map()) et
 * déclenchait systématiquement une erreur d'hydratation React sur cette
 * page (reproduite à 100%). Le pattern composant client dédié est celui
 * déjà utilisé sans erreur ailleurs dans l'admin (staff, produits,
 * fournisseurs, utilisateurs, validations).
 */
export function B2cReservationRowActions({
  reservationId,
  publicRef,
  status,
}: B2cReservationRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions pour la réservation ${publicRef}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/admin/reservations/${reservationId}`}>
            <Eye className="mr-2 h-4 w-4" />
            Voir détails
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Pas encore disponible">
          <Edit className="mr-2 h-4 w-4" />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {status === "pending" && (
          <DropdownMenuItem
            disabled
            title="Utilisez /admin/reservations pour changer le statut"
            className="text-emerald-600"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirmer
          </DropdownMenuItem>
        )}
        {(status === "pending" || status === "confirmed") && (
          <DropdownMenuItem
            disabled
            title="Utilisez /admin/reservations pour changer le statut"
            className="text-red-600"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Annuler
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
