"use client"

/**
 * CRM / Leads — formulaire de capture réutilisable ("Être rappelé" /
 * "Demander un devis"), à embarquer sur une page produit à côté du CTA
 * tel:/WhatsApp existant (jamais en remplacement — un visiteur peut
 * toujours préférer appeler directement).
 */

import { useState } from "react"
import { usePathname } from "next/navigation"
import { CheckCircle2, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { submitLead, type SubmitLeadInput } from "@/app/actions/submit-lead"
import type { LeadProductType } from "@/lib/crm/leads-core"

interface LeadCaptureFormProps {
  productType: LeadProductType
  productRef?: string
  productLabel?: string
  title?: string
}

export function LeadCaptureForm({
  productType,
  productRef,
  productLabel,
  title = "Demander un devis",
}: LeadCaptureFormProps) {
  const pathname = usePathname()
  const [firstName, setFirstName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [website, setWebsite] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)

    const input: SubmitLeadInput = {
      firstName,
      email,
      phone,
      message,
      productType,
      productRef,
      productLabel,
      sourcePage: pathname,
      website,
    }

    submitLead(input)
      .then((result) => {
        if (!result.ok) {
          setError(result.error)
          return
        }
        setSent(true)
      })
      .catch(() => setError("Erreur technique. Veuillez réessayer."))
      .finally(() => setPending(false))
  }

  if (sent) {
    return (
      <div className="border-border bg-emerald-50 flex items-start gap-2 rounded-xl border p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-emerald-800">
          Votre demande a bien été envoyée — un conseiller vous recontactera rapidement.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border-border rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="text-muted-foreground h-4 w-4" />
        <span className="text-foreground text-sm font-semibold">{title}</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <Label htmlFor="lead-firstName" className="text-xs">
            Nom
          </Label>
          <Input
            id="lead-firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={100}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label htmlFor="lead-email" className="text-xs">
              Email
            </Label>
            <Input
              id="lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={320}
            />
          </div>
          <div>
            <Label htmlFor="lead-phone" className="text-xs">
              Téléphone
            </Label>
            <Input
              id="lead-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="lead-message" className="text-xs">
            Message (facultatif)
          </Label>
          <Textarea
            id="lead-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>

        {/* Honeypot — invisible pour un visiteur humain, jamais dans le flux clavier/lecteur d'écran. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute h-0 w-0 opacity-0"
        />

        {error && <p className="text-destructive text-xs">{error}</p>}

        <Button type="submit" disabled={pending || !firstName} className="w-full">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer ma demande"}
        </Button>
      </div>
    </form>
  )
}
