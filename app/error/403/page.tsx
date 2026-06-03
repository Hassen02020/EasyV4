/**
 * Page Erreur 403 - Accès Interdit
 * 
 * Affichée lorsqu'un utilisateur tente d'accéder à une ressource
 * sans les permissions nécessaires.
 */

import Link from "next/link"
import { Shield, ArrowLeft, Home, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "403 - Accès Interdit | Easy2Book",
  description: "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.",
}

interface ForbiddenPageProps {
  searchParams: Promise<{ 
    section?: string
    permission?: string 
    from?: string
  }>
}

export default async function ForbiddenPage({ searchParams }: ForbiddenPageProps) {
  const params = await searchParams
  const section = params.section
  const from = params.from

  const sectionMessages: Record<string, string> = {
    accounting: "La comptabilité est accessible uniquement aux agents comptables et managers.",
    staff: "La gestion du personnel est réservée aux managers.",
    admin: "L'administration système est réservée au Super Admin.",
    products: "La modification du catalogue nécessite des droits spécifiques.",
  }

  const message = section ? sectionMessages[section] : "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource."

  return (
    <div className="from-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Shield className="text-destructive h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold">403</CardTitle>
          <CardDescription className="text-lg">Accès Interdit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-amber-600">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">Protection RBAC Active</span>
            </div>
            <p className="text-muted-foreground">
              {message}
            </p>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-muted-foreground text-sm">
              Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez votre manager ou le support technique.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {from && (
              <Button variant="outline" className="flex-1" asChild>
                <Link href={from}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour
                </Link>
              </Button>
            )}
            <Button className="flex-1 bg-[#1e3a5f]" asChild>
              <Link href="/admin">
                <Home className="mr-2 h-4 w-4" />
                Tableau de bord
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
