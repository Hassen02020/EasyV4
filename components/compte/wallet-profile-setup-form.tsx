"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, UserCheck } from "lucide-react"
import { createCustomerProfile } from "@/lib/finance/b2c-topup-actions"

export function WalletProfileSetupForm() {
  const router = useRouter()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createCustomerProfile(
        firstName.trim(),
        lastName.trim(),
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="bg-muted border-border rounded-2xl border p-6">
      <div className="mb-3 flex items-center gap-2">
        <UserCheck className="text-accent h-5 w-5 shrink-0" />
        <p className="text-foreground text-sm font-semibold">
          Activez votre portefeuille
        </p>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        Renseignez votre prénom et nom pour créer votre profil client et accéder
        à la recharge de votre portefeuille.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="profile-firstname"
            className="text-foreground mb-1.5 block text-sm font-medium"
          >
            Prénom <span aria-hidden="true">*</span>
          </label>
          <input
            id="profile-firstname"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            required
            disabled={isPending}
            placeholder="Votre prénom"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-accent w-full rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="profile-lastname"
            className="text-foreground mb-1.5 block text-sm font-medium"
          >
            Nom <span aria-hidden="true">*</span>
          </label>
          <input
            id="profile-lastname"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            required
            disabled={isPending}
            placeholder="Votre nom de famille"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-accent w-full rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
          />
        </div>

        {error && (
          <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !firstName.trim() || !lastName.trim()}
          className="bg-accent hover:bg-accent/90 disabled:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Création du profil…
            </>
          ) : (
            "Créer mon profil et accéder au portefeuille"
          )}
        </button>
      </form>
    </div>
  )
}
