"use server"

/**
 * CRM / Leads — soumission publique ("Être rappelé" / "Demander un devis"),
 * appelable par un visiteur non connecté (jamais de session requise, comme
 * createGuestReservationFromDraft et les autres actions guest de ce projet).
 *
 * `agencyId` résolu serveur via `getDefaultAgencyId()` (storefront public,
 * même source que guestTenantContext()) — jamais fourni par le client.
 * `website` est un honeypot : un champ caché, jamais rempli par un visiteur
 * humain — non vide = bot, `ok: true` renvoyé quand même (ne jamais révéler
 * la détection à l'appelant) sans rien persister. Rate-limité par IP, même
 * bucket pattern que les routes de recherche publiques (lib/rate-limit.ts).
 *
 * CRM-LEAD-WIRING-01 — câblé sur captureWebsiteLeadCore
 * (lib/crm/website-lead-capture-core.ts), même patron que
 * lib/meta-leadads/lead-capture-core.ts pour le canal Meta Lead Ads.
 */

import { headers } from "next/headers"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { rateLimit } from "@/lib/rate-limit"
import { LEAD_PRODUCT_TYPES, LEAD_INTENTIONS } from "@/lib/crm/leads-core"
import { captureWebsiteLeadCore } from "@/lib/crm/website-lead-capture-core"
import { sendEvent } from "@/lib/inngest/client"

const inputSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    phone: z.string().trim().max(32).optional().or(z.literal("")),
    message: z.string().trim().max(2000).optional(),
    productType: z.enum(LEAD_PRODUCT_TYPES).default("general"),
    productRef: z.string().trim().max(128).optional(),
    productLabel: z.string().trim().max(255).optional(),
    sourcePage: z.string().trim().min(1).max(255),
    /** CRM-NICHE-01 — optionnel : pas tous les formulaires n'exposent encore ce champ. */
    destination: z.string().trim().max(128).optional(),
    /** CRM-NICHE-01 — défaut "standard" si le formulaire ne le précise pas. */
    intention: z.enum(LEAD_INTENTIONS).default("standard"),
    /** UTM-CAPTURE-01 — ?campaign= ou ?utm_campaign= depuis l'URL d'atterrissage. Donnée analytique fournie par le visiteur, jamais utilisée dans un calcul financier. */
    campaignRef: z.string().trim().max(255).optional(),
    /** Honeypot — doit rester vide. */
    website: z.string().optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Indiquez un email ou un téléphone pour être recontacté.",
    path: ["email"],
  })

export type SubmitLeadInput = z.infer<typeof inputSchema>

export type SubmitLeadResult = { ok: true } | { ok: false; error: string }

export async function submitLead(
  raw: SubmitLeadInput,
): Promise<SubmitLeadResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Entrée invalide.",
    }
  }

  // Honeypot rempli : silence complet, jamais un signal exploitable par un bot.
  if (parsed.data.website) {
    return { ok: true }
  }

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const hdrs = await headers()
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`leads:submit:${ip}`)
  if (!limit.ok) {
    return {
      ok: false,
      error: "Trop de demandes envoyées. Réessayez dans quelques minutes.",
    }
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    const { leadId } = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: true },
      (tx) =>
        captureWebsiteLeadCore(tx, {
          agencyId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName || null,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          message: parsed.data.message || null,
          productType: parsed.data.productType,
          productRef: parsed.data.productRef || null,
          productLabel: parsed.data.productLabel || null,
          sourcePage: parsed.data.sourcePage,
          destination: parsed.data.destination || null,
          intention: parsed.data.intention,
          campaignRef: parsed.data.campaignRef || null,
        }),
    )

    // Notification en arrière-plan — erreur Inngest silencieuse (lead déjà persisté)
    await sendEvent("crm/lead.created", {
      leadId,
      agencyId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      message: parsed.data.message || null,
      productType: parsed.data.productType,
      productLabel: parsed.data.productLabel || null,
      sourcePage: parsed.data.sourcePage,
    }).catch((err) => {
      console.error("[submitLead] inngest event failed (non-fatal)", err)
    })

    return { ok: true }
  } catch (err) {
    console.error("[submitLead]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
