/**
 * GET|POST /api/cron/purge-audit
 *
 * AUDIT-RETENTION-01, étape 1 (2026-11-08) — PURGE DÉSACTIVÉE.
 *
 * Cette route supprimait sans distinction toute ligne `audit_events` de plus
 * de 30 jours. Elle plantait en production depuis le 2026-09-20 (une `Date`
 * passée brute au pilote dans `sql\`${cutoff}\`` → ERR_INVALID_ARG_TYPE), donc
 * n'a jamais rien supprimé. Corriger seulement ce plantage aurait détruit des
 * traces encore utilisées au-delà de 30 jours :
 *  - historique d'une réservation affiché au back-office
 *    (lib/booking/reservation-detail.ts) ;
 *  - verrous anti-doublon (marqueur d'email de vol, index unique des
 *    notifications réussies, clé d'écart du rapprochement des paiements) ;
 *  - traces financières (`payment.voided`, `entitlements.to_compensate` —
 *    compensation à traiter manuellement) ;
 *  - aucune durée de conservation n'a été décidée par la Direction.
 *
 * Fermer le trou d'abord : la route reste protégée par CRON_SECRET et répond
 * désormais « purge désactivée » sans jamais rien supprimer — le cron
 * quotidien (vercel.json, 03:00) ne plante plus. Étape 2, sur décision
 * Direction (durée de conservation D1, familles exclues D2) et GO séparé :
 * purge limitée aux familles autorisées ; la date limite devra alors être
 * passée directement à `lt(auditEvents.createdAt, cutoff)` (objet Date, colonne
 * timestamp), jamais via `sql\`${cutoff}\``.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const PURGE_DISABLED_REASON =
  "Purge désactivée en attendant la politique de conservation des traces d'audit (AUDIT-RETENTION-01)."

async function handlePurge(request: Request) {
  const auth = request.headers.get("authorization")
  const token = auth?.replace("Bearer ", "")
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    disabled: true,
    deleted: 0,
    reason: PURGE_DISABLED_REASON,
  })
}

export async function GET(request: Request) {
  return handlePurge(request)
}

export async function POST(request: Request) {
  return handlePurge(request)
}
