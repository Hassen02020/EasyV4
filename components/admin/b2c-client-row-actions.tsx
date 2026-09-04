"use client"

import { Eye, Edit, FileText, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface B2cClientRowActionsProps {
  displayName: string
}

/**
 * Menu d'actions pour une ligne de app/admin/b2c/clients — extrait en
 * Client Component dédié (même pattern que components/admin/user-row-actions.tsx
 * et product-row-actions.tsx). Root cause corrigée : ce DropdownMenu Radix
 * était auparavant inline dans le Server Component de la page (une par ligne
 * de tableau, .map()) ce qui déclenchait systématiquement une erreur
 * d'hydratation React ("Hydration failed...") sur cette page — reproduite à
 * 100% (3/3 tentatives, ordre des lignes vérifié identique BDD ↔ DOM, donc
 * pas un problème de tri non déterministe). Le même pattern extrait en
 * composant client dédié est utilisé sans erreur ailleurs dans l'admin
 * (staff, produits, fournisseurs, utilisateurs, validations) — ce fix aligne
 * cette page sur ce pattern déjà éprouvé plutôt que d'inventer un nouveau
 * mécanisme.
 */
export function B2cClientRowActions({ displayName }: B2cClientRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions pour ${displayName}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem disabled title="Pas encore disponible">
          <Eye className="mr-2 h-4 w-4" />
          Voir profil
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Pas encore disponible">
          <Edit className="mr-2 h-4 w-4" />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Pas encore disponible">
          <FileText className="mr-2 h-4 w-4" />
          Voir réservations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
