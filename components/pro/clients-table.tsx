"use client"

import { useMemo, useState } from "react"
import { Search, Mail, Phone, User } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { PartnerClient } from "@/lib/pro/mock-tables"

interface ClientsTableProps {
  rows: PartnerClient[]
}

export function ClientsTable({ rows }: ClientsTableProps) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.phone ?? "").includes(needle),
    )
  }, [rows, q])

  return (
    <div className="space-y-4">
      <section
        aria-label="Recherche clients"
        className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4"
      >
        <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
          Mots clés
        </label>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom, email, téléphone…"
            className="pl-9"
          />
        </div>
      </section>

      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Nom</TableHead>
              <TableHead className="font-semibold">Téléphone</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="text-right font-semibold">
                Réservations
              </TableHead>
              <TableHead className="font-semibold">Premier dossier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucun client trouvé.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="bg-secondary/15 text-secondary flex h-7 w-7 items-center justify-center rounded-full">
                        <User className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium">{c.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`tel:${(c.phone ?? "").replace(/\s+/g, "")}`}
                      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
                    >
                      <Phone className="h-3 w-3" />
                      {c.phone ?? "—"}
                    </a>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${c.email}`}
                      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
                    >
                      <Mail className="h-3 w-3" />
                      {c.email}
                    </a>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="font-bold">
                      {c.bookings ?? c.reservationsCount}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.createdAt ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-border/60 text-muted-foreground border-t px-4 py-2 text-xs">
          {filtered.length} client{filtered.length > 1 ? "s" : ""} affiché
          {filtered.length > 1 ? "s" : ""}
        </div>
      </section>
    </div>
  )
}
