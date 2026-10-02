import { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { developmentProjects } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { deleteDevelopmentProject } from "@/lib/market/admin-actions"

export const metadata: Metadata = { title: "Projets de développement — Veille" }
export const dynamic = "force-dynamic"

const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-slate-100 text-slate-700",
}

export default async function DevelopmentProjectsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/veille/projets")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const db = getDb()
  const projects = await db
    .select()
    .from(developmentProjects)
    .orderBy(desc(developmentProjects.publishedAt))
    .limit(100)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projets de développement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projects.length} projet{projects.length !== 1 ? "s" : ""}{" "}
            enregistré{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/veille/projets/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau projet
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          Aucun projet enregistré.{" "}
          <Link href="/admin/veille/projets/new" className="underline">
            Créer le premier
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Lieu</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Confiance</TableHead>
                <TableHead>Publié le</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {p.name}
                  </TableCell>
                  <TableCell>{p.location ?? "—"}</TableCell>
                  <TableCell>{p.projectType ?? "—"}</TableCell>
                  <TableCell>{p.status ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={CONFIDENCE_BADGE[p.confidence] ?? ""}>
                      {p.confidence}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(p.publishedAt).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Voir la source"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          href={`/admin/veille/projets/${p.id}`}
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <form
                        action={async () => {
                          "use server"
                          await deleteDevelopmentProject(p.id)
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          type="submit"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
