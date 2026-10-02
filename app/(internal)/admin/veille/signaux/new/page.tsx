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
import { createMarketSignal } from "@/lib/market/admin-actions"

export const metadata: Metadata = { title: "Nouveau signal marché" }
export const dynamic = "force-dynamic"

export default async function NewMarketSignalPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/veille/signaux/new")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  async function handleCreate(formData: FormData) {
    "use server"
    const result = await createMarketSignal({
      title: formData.get("title"),
      sourceUrl: formData.get("sourceUrl"),
      publishedAt: formData.get("publishedAt"),
      confidence: formData.get("confidence"),
      summary: formData.get("summary") || undefined,
      category: formData.get("category") || undefined,
      region: formData.get("region") || undefined,
    })
    if (result.ok) {
      redirect("/admin/veille/signaux")
    }
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/veille/signaux">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Nouveau signal marché</h1>
      </div>

      <form action={handleCreate} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titre *</Label>
          <Input id="title" name="title" required maxLength={500} />
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
            <Label htmlFor="category">Catégorie</Label>
            <Input id="category" name="category" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">Région</Label>
            <Input id="region" name="region" maxLength={100} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="summary">Résumé</Label>
          <Textarea id="summary" name="summary" rows={4} maxLength={2000} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">Créer le signal</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/veille/signaux">Annuler</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
