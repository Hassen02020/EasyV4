"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ShieldCheck,
  Building2,
  Users,
  HeartHandshake,
  ArrowLeft,
  Loader2,
  Lock,
  Mail,
  Key,
  AlertCircle,
} from "lucide-react"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { validateRoleAccess } from "@/app/actions/validate-role"

type RoleOption = {
  value: "super_admin" | "admin" | "partner" | "mutuelle"
  label: string
  description: string
  icon: React.ElementType
  redirectPath: string
  requiresSpecialCode?: boolean
  allowedEmailDomains?: string[]
}

const ROLES: RoleOption[] = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Accès total au système",
    icon: ShieldCheck,
    redirectPath: "/admin",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Gestion réservations & dashboard",
    icon: ShieldCheck,
    redirectPath: "/admin",
  },
  {
    value: "partner",
    label: "Client B2B",
    description: "Tarifs préférentiels & wallet",
    icon: Building2,
    redirectPath: "/b2b",
    allowedEmailDomains: ["agence.tn", "voyage.tn", "travel.com"],
  },
  {
    value: "mutuelle",
    label: "Mutuelle",
    description: "Gestion dossiers assurés",
    icon: HeartHandshake,
    redirectPath: "/mutuelle",
    requiresSpecialCode: true,
  },
]

export default function LoginSelectPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<RoleOption["value"] | "">("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [specialCode, setSpecialCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedRoleData = ROLES.find((r) => r.value === selectedRole)

  function validateEmailForRole(email: string, role: RoleOption): boolean {
    if (!role.allowedEmailDomains) return true
    const domain = email.split("@")[1]
    return role.allowedEmailDomains.some((d) =>
      domain?.toLowerCase().endsWith(d.toLowerCase()),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!selectedRoleData) {
      setError("Veuillez sélectionner un rôle")
      return
    }

    // Validation email domain pour B2B
    if (
      selectedRoleData.allowedEmailDomains &&
      !validateEmailForRole(email, selectedRoleData)
    ) {
      setError(
        `Email non autorisé. Domaines acceptés: ${selectedRoleData.allowedEmailDomains.join(", ")}`,
      )
      return
    }

    // Validation code spécial pour Mutuelle
    if (selectedRoleData.requiresSpecialCode && specialCode !== "MUT2024") {
      setError("Code d'accès mutuelle invalide")
      return
    }

    startTransition(async () => {
      const result = await validateRoleAccess({
        email,
        password,
        role: selectedRole,
      })

      if (!result.ok) {
        setError(result.message)
        return
      }

      // Redirection vers le bon dashboard selon le rôle
      const redirectTo = selectedRoleData.redirectPath
      router.push(redirectTo)
    })
  }

  function handleRoleChange(value: string) {
    setSelectedRole(value as RoleOption["value"])
    setError(null)
    setSpecialCode("")
  }

  return (
    <main className="from-background via-background to-accent/10 relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12">
      {/* Background blobs */}
      <div
        aria-hidden
        className="bg-primary/10 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-secondary/15 absolute -right-20 -bottom-20 h-72 w-72 rounded-full blur-3xl"
      />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Retour à l'accueil">
            <Easy2BookLogo className="h-16 w-16" priority />
          </Link>
          <h1 className="text-foreground mt-5 text-2xl font-semibold tracking-tight">
            Connexion Easy2Book
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sélectionnez votre profil pour accéder à votre espace
          </p>
        </div>

        {/* Role Selection */}
        <div className="bg-card border-border/60 shadow-e2b-soft space-y-4 rounded-2xl border p-6">
          <div className="space-y-2">
            <Label htmlFor="role">Sélectionnez votre rôle</Label>
            <Select value={selectedRole} onValueChange={handleRoleChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisissez un rôle..." />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => {
                  const Icon = role.icon
                  return (
                    <SelectItem
                      key={role.value}
                      value={role.value}
                      className="py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-[#1e3a5f]" />
                        <div className="flex flex-col">
                          <span className="font-medium">{role.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {role.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Form */}
          {selectedRoleData && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="border-border border-t pt-4">
                <p className="text-muted-foreground mb-4 text-center text-sm">
                  Connexion {selectedRoleData.label}
                </p>

                {/* Special Code for Mutuelle */}
                {selectedRoleData.requiresSpecialCode && (
                  <div className="space-y-2">
                    <Label htmlFor="specialCode">
                      Code d&apos;accès Mutuelle
                    </Label>
                    <div className="relative">
                      <Key className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                      <Input
                        id="specialCode"
                        type="password"
                        value={specialCode}
                        onChange={(e) => setSpecialCode(e.target.value)}
                        placeholder="Entrez votre code"
                        className="pl-9"
                        required
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Code démo: MUT2024
                    </p>
                  </div>
                )}

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                      className="pl-9"
                      required
                    />
                  </div>
                  {selectedRoleData.allowedEmailDomains && (
                    <p className="text-muted-foreground text-xs">
                      Domaines autorisés:{" "}
                      {selectedRoleData.allowedEmailDomains.join(", ")}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erreur</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Submit */}
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connexion en cours...
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Guest Option */}
          {!selectedRoleData && (
            <div className="border-border border-t pt-4">
              <p className="text-muted-foreground mb-3 text-center text-sm">
                Ou consultez votre réservation sans connexion
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/bookings">
                  <Users className="mr-2 h-4 w-4" />
                  Mes Réservations (Code)
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Back link */}
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  )
}
