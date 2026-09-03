"use client"

/**
 * Verrous d'inventaire — table de lecture seule (`/admin/inventory`). Pas
 * d'action de mutation ici : la décision de verrouillage vit dans Redis
 * (lib/booking/inventory.ts), cette table Postgres n'est qu'un journal
 * d'audit — voir lib/admin/inventory-locks-actions.ts.
 */

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { InventoryLock } from "@/lib/db/schema"

const STATUS_LABEL: Record<InventoryLock["status"], string> = {
  active: "Actif",
  confirmed: "Confirmé",
  expired: "Expiré",
  released: "Libéré",
}

const STATUS_COLOR: Record<InventoryLock["status"], string> = {
  active: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  expired: "bg-gray-100 text-gray-800",
  released: "bg-blue-100 text-blue-800",
}

export function InventoryLocksTable({ locks }: { locks: InventoryLock[] }) {
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = useMemo(
    () => locks.filter((l) => statusFilter === "all" || l.status === statusFilter),
    [locks, statusFilter],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.keys(STATUS_LABEL) as InventoryLock["status"][]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Offre</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Prix figé</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Expire le</TableHead>
                <TableHead>Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucun verrou d&apos;inventaire pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lock) => (
                  <TableRow key={lock.id} className="hover:bg-gray-50">
                    <TableCell>
                      <Badge variant="outline">{lock.module}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{lock.itemId}</TableCell>
                    <TableCell className="max-w-32 truncate font-mono text-xs">{lock.sessionId}</TableCell>
                    <TableCell>{lock.priceTnd ? `${Number(lock.priceTnd).toLocaleString("fr-FR")} DT` : "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLOR[lock.status]}>{STATUS_LABEL[lock.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(lock.expiresAt).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(lock.createdAt).toLocaleString("fr-FR")}
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
