import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"
import { TunisiaGoLogo } from "@/components/tunisia-go-logo"
import Link from "next/link"

export const metadata = {
  title: "Connexion — TunisiaGo Admin",
  description: "Connexion à l'espace administrateur TunisiaGo",
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Link href="/" aria-label="Retour à l'accueil TunisiaGo">
            <TunisiaGoLogo className="h-12 w-auto" />
          </Link>
          <h1 className="text-foreground mt-6 text-2xl font-semibold">
            Connexion Back-office
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Accès réservé aux administrateurs TunisiaGo
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-card h-64 animate-pulse rounded-lg border" />
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          En cas de problème de connexion, contactez{" "}
          <a
            href="mailto:tarhouni.hassene@gmail.com"
            className="font-medium text-blue-700 hover:underline"
          >
            le support
          </a>
          .
        </p>
      </div>
    </main>
  )
}
