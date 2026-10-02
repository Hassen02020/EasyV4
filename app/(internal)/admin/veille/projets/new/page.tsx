import { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { createDevelopmentProject } from "@/lib/market/admin-actions"

export const metadata: Metadata = { title: "Nouveau projet de développement" }
export const dynamic = "force-dynamic"

export default async function NewDevelopmentProjectPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/veille/projets/new")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  async function handleCreate(formData: FormData) {
    "use server"
    const result = await createDevelopmentProject({
      name: formData.get("name"),
      sourceUrl: formData.get("sourceUrl"),
      publishedAt: formData.get("publishedAt"),
      confidence: formData.get("confidence"),
      description: formData.get("description") || undefined,
      location: formData.get("location") || undefined,
      projectType: formData.get("projectType") || undefined,
      status: formData.get("status") || undefined,
    })
    if (result.ok) {
      redirect("/admin/veille/projets")
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/veille/projets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Nouveau projet de développement</h1>
      </div>

      <form action={handleCreate} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nom du projet *</Label>
          <Input id="name" name="name" required maxLength={500} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceUrl">URL source *</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            required
            placeholder="https://..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="publishedAt">Date de publication *</Label>
            <Input
              id="publishedAt"
              name="publishedAt"
              type="datetime-local"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Niveau de confiance *</Label>
            <Select name="confidence" required>
              <SelectTrigger>
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">Élevé (HIGH)</SelectItem>
                <SelectItem value="MEDIUM">Moyen (MEDIUM)</SelectItem>
                <SelectItem value="LOW">Faible (LOW)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Lieu</Label>
            <Input id="location" name="location" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectType">Type de projet</Label>
            <Input id="projectType" name="projectType" maxLength={100} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <Input
            id="status"
            name="status"
            maxLength={100}
            placeholder="ex : En construction, Annoncé…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            maxLength={4000}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">Créer le projet</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/veille/projets">Annuler</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
