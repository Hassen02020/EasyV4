import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import {
  UsersManager,
  type PartnerUserRow,
} from "@/components/pro/users-manager"

export const metadata = { title: "Utilisateurs | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProUsersPage() {
  const initial: PartnerUserRow[] = [
    {
      id: "u-owner",
      email: "silianos.kesra@example.tn",
      fullName: "Silianos Kesra",
      role: "partner_owner",
      isActive: true,
      lastLoginAt: "2026-05-13 09:42",
    },
    {
      id: "u-a1",
      email: "leila.karoui@example.tn",
      fullName: "Leila Karoui",
      role: "partner_agent",
      isActive: true,
      lastLoginAt: "2026-05-12 17:21",
    },
    {
      id: "u-a2",
      email: "karim.trabelsi@example.tn",
      fullName: "Karim Trabelsi",
      role: "partner_agent",
      isActive: false,
      lastLoginAt: "2026-04-22 11:05",
    },
  ]

  return (
    <ProPageShell
      icon={Users}
      title="Utilisateurs de l'agence"
      iconTone="secondary"
      description="Invitez vos collaborateurs et gérez leurs accès au portail Pro."
    >
      <UsersManager initial={initial} maxAgents={5} />
    </ProPageShell>
  )
}
