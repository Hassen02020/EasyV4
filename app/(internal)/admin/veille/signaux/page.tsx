import { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, ExternalLink } from "lucide-react"
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
import { marketSignals } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { deleteMarketSignal } from "@/lib/market/admin-actions"

export const metadata: Metadata = { title: "Signaux marché — Veille" }
export const dynamic = "force-dynamic"

const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-slate-100 text-slate-700",
}

export default async function MarketSignalsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/veille/signaux")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const db = getDb()
  const signals = await db
    .select()
    .from(marketSignals)
    .orderBy(desc(marketSignals.publishedAt))
    .limit(100)

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Signaux marché</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {signals.length} signal{signals.length !== 1 ? "s" : ""} enregistré
            {signals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/veille/signaux/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau signal
          </Link>
        </Button>
      </div>

      {signals.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border p-12 text-center">
          Aucun signal enregistré.{" "}
          <Link href="/admin/veille/signaux/new" className="underline">
            Créer le premier
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Région</TableHead>
                <TableHead>Confiance</TableHead>
                <TableHead>Publié le</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-xs truncate font-medium">
                    {s.title}
                  </TableCell>
                  <TableCell>{s.category ?? "—"}</TableCell>
                  <TableCell>{s.region ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={CONFIDENCE_BADGE[s.confidence] ?? ""}>
                      {s.confidence}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(s.publishedAt).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={s.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Voir la source"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <form
                        action={async () => {
                          "use server"
                          await deleteMarketSignal(s.id)
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          type="submit"
                          title="Supprimer"
                        >
                          <Trash2 className="text-destructive h-4 w-4" />
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
