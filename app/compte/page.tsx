import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Mail, Phone, User as UserIcon } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { listMyReservations } from "@/app/actions/list-my-reservations"
import { CompteReservationList } from "@/components/compte/compte-reservation-list"
import { CompteLogoutButton } from "@/components/compte/compte-logout-button"
import { Easy2BookLogo } from "@/components/easy2book-logo"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Mon compte | Easy2Book",
  description: "Historique de vos réservations Easy2Book.",
}

export default async function ComptePage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/compte/connexion?next=/compte")
  }

  const result = await listMyReservations()

  // La plus récente réservation sert de source pour l'aperçu profil
  // (nom/téléphone) — `customers` n'a pas de ligne canonique unique par
  // client connecté dans cette implémentation minimale (voir la doc de
  // list-my-reservations.ts) : édition du profil hors périmètre pour
  // l'instant, affichage seul.
  const profile = result.ok ? result.bookings[0]?.customer : undefined

  return (
    <div className="from-background via-background to-accent/5 min-h-screen bg-gradient-to-br">
      {/* Top bar — même convention que /bookings (page "compte", pas le site marchand complet). */}
      <div className="border-border border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Easy2BookLogo withWordmark={false} className="size-9 bg-gray-100" priority />
            <span className="text-base font-bold">
              <span className="text-sidebar">Easy</span>
              <span className="text-accent">2</span>
              <span className="text-sidebar">Book</span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-foreground text-3xl font-bold">Mon compte</h1>
            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </p>
          </div>
          <CompteLogoutButton />
        </div>

        {profile && (profile.firstName || profile.phone) && (
          <div className="bg-card border-border mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-4 text-sm">
            {profile.firstName && (
              <span className="flex items-center gap-1.5">
                <UserIcon className="text-muted-foreground h-4 w-4" />
                {profile.firstName} {profile.lastName}
              </span>
            )}
            {profile.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="text-muted-foreground h-4 w-4" />
                {profile.phone}
              </span>
            )}
          </div>
        )}

        {!result.ok ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-2xl border p-6 text-sm">
            {result.error === "NOT_AUTHENTICATED"
              ? "Session expirée — reconnectez-vous."
              : result.error}
          </div>
        ) : result.bookings.length === 0 ? (
          <div className="bg-card border-border rounded-2xl border p-10 text-center">
            <p className="text-foreground text-base font-semibold">
              Aucune réservation trouvée pour {result.email}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Vos futures réservations effectuées avec cet email apparaîtront ici.
            </p>
            <Link
              href="/"
              className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
            >
              Rechercher un hôtel
            </Link>
          </div>
        ) : (
          <CompteReservationList bookings={result.bookings} />
        )}
      </div>
    </div>
  )
}
