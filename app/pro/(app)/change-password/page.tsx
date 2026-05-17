import { KeyRound } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Changer le mot de passe | Espace Pro Easy2Book" }

export default function ProChangePasswordPage() {
  return (
    <ProPageShell
      icon={KeyRound}
      title="Changer mon mot de passe"
      description="Mettez à jour les identifiants d'accès à votre Espace Pro."
    >
      <ProPagePlaceholder
        title="Formulaire de changement de mot de passe"
        hint="Champs Ancien · Nouveau · Confirmation, avec règles de robustesse — connecté à Supabase Auth en phase 8."
      />
    </ProPageShell>
  )
}
