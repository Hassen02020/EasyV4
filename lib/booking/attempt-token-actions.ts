"use server"

/**
 * GUEST-IDEMPOTENCY-01 — émission du jeton de tentative (une fois par
 * instance de formulaire). Mode `off` (défaut) : aucun jeton, le formulaire
 * garde le comportement historique.
 */

import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import {
  getAttemptTokenMode,
  issueAttemptToken,
  type AttemptModule,
} from "@/lib/booking/attempt-token"

export type IssueAttemptTokenResult =
  | { ok: true; token: string | null }
  | { ok: false; error: string }

export async function issueGuestAttemptToken(
  module: AttemptModule,
): Promise<IssueAttemptTokenResult> {
  if (module !== "transfer") return { ok: false, error: "Module non supporté" }
  if (getAttemptTokenMode() === "off") return { ok: true, token: null }
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return { ok: false, error: "Réservation indisponible" }
  return { ok: true, token: issueAttemptToken(module, agencyId) }
}
