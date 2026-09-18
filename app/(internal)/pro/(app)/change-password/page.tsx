import { KeyRound } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { ChangePasswordForm } from "@/components/pro/change-password-form"

export const metadata = { title: "Changer mot de passe | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProChangePasswordPage() {
  return (
    <ProPageShell
      icon={KeyRound}
      title="Changer mot de passe"
      iconTone="primary"
      description="Mettez à jour le mot de passe de votre compte Pro."
    >
      <ChangePasswordForm />
    </ProPageShell>
  )
}
