/**
 * Cible de `proxy.ts` (garde RBAC sur `/admin/*`) quand un compte
 * authentifié n'a pas le rôle/agence requis — y compris un compte suspendu
 * (`getCurrentAdminProfile`/`getCurrentPartnerProfile` renvoient alors
 * `null`, ce qui déclenche en cascade ce redirect). La route n'existait pas
 * (confirmé pendant l'audit de certification E2E) : l'utilisateur atterrissait
 * sur le 404 générique Next.js au lieu d'un message honnête.
 */
import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-full">
          <ShieldAlert className="text-destructive h-7 w-7" />
        </div>
        <h1 className="text-foreground mt-4 text-xl font-bold">
          Accès non autorisé
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Votre compte n&apos;a pas les droits nécessaires pour accéder à
          cette page, ou a été suspendu. Contactez votre administrateur si
          vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
