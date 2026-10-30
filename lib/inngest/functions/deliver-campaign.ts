/**
 * CAMPAIGN-DELIVERY-01 — fonction Inngest de livraison des messages de campagne.
 *
 * Déclenchée par l'événement `crm/campaign.launched` (émis par
 * lib/admin/campaign-lifecycle-actions.ts après un lancement réussi).
 *
 * Toute la logique métier (chargement des cibles, envoi, mise à jour du
 * statut) vit dans lib/crm/campaign-delivery-core.ts, directement testable
 * sans harnais Inngest. Ce fichier n'est qu'un fin wrapper de câblage.
 *
 * Retries : 3 tentatives. Un envoi en échec laisse la cible 'pending' pour
 * le retry ; après la dernière tentative, onFailure passe les cibles
 * restantes à 'failed' (CRM-CAMPAIGN-SAFETY-01). Les cibles 'skipped'
 * (whatsapp/call, consentement retiré, campagne annulée) sont définitives.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import {
  deliverCampaignCore,
  markRemainingTargetsFailedCore,
} from "@/lib/crm/campaign-delivery-core"
import { makeOnFailure } from "@/lib/inngest/on-failure"

type LaunchedData = Events["crm/campaign.launched"]["data"]

const observeFailure = makeOnFailure("deliver-campaign")

/** L'événement d'échec Inngest porte l'événement d'origine dans data.event. */
function launchedDataFromFailure(event: unknown): LaunchedData | null {
  const data = (event as { data?: Record<string, unknown> } | null)?.data
  const original = (data?.event as { data?: Record<string, unknown> })?.data
  const source = original ?? data
  return typeof source?.campaignId === "string" &&
    typeof source?.agencyId === "string"
    ? (source as unknown as LaunchedData)
    : null
}

export const deliverCampaign = inngest.createFunction(
  {
    id: "deliver-campaign",
    name: "Campagne lancée — livraison des messages",
    retries: 3,
    // Une seule livraison à la fois par campagne : deux exécutions
    // simultanées ne peuvent pas traiter les mêmes cibles 'pending'.
    concurrency: { key: "event.data.campaignId", limit: 1 },
    triggers: { event: "crm/campaign.launched" },
    // CRM-CAMPAIGN-SAFETY-01 : après la dernière tentative, les cibles encore
    // 'pending' passent 'failed' (jamais avant : un échec reste reprenable).
    onFailure: async ({
      error,
      event,
    }: {
      error: unknown
      event?: { data?: Record<string, unknown> } | null
    }) => {
      await observeFailure({ error, event })
      const launched = launchedDataFromFailure(event)
      if (!launched) return
      await withTenantContext(
        { agencyId: launched.agencyId, userId: "", isSuperAdmin: false },
        (tx) =>
          markRemainingTargetsFailedCore(tx, {
            agencyId: launched.agencyId,
            campaignId: launched.campaignId,
          }),
      )
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: LaunchedData }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const { campaignId, agencyId } = event.data

    return step.run("deliver-messages", async () => {
      // Le nom d'agence affiché n'est « Easy2Book » que pour l'agence OTA
      // par défaut ; l'agencyId vient de l'événement émis par le lancement
      // (agence du staff authentifié, lib/admin/campaign-lifecycle-actions.ts).
      const defaultAgencyId = await getDefaultAgencyId()

      const result = await deliverCampaignCore(
        {
          agencyId,
          campaignId,
          agencyName: defaultAgencyId === agencyId ? "Easy2Book" : undefined,
        },
        {
          // Une courte transaction par opération : un envoi réussi est
          // enregistré aussitôt et n'est jamais annulé par un autre échec.
          runTx: (fn) =>
            withTenantContext(
              { agencyId, userId: "", isSuperAdmin: false },
              fn,
            ),
        },
      )

      // Échecs d'envoi : les cibles concernées sont restées 'pending' ; on
      // lève pour que le retry Inngest les reprenne (clé d'idempotence Resend
      // = aucun doublon pour celles qui étaient en fait parties).
      if (result.failed > 0) {
        const errors = result.outcomes
          .filter((o) => o.status === "failed")
          .map((o) => o.code ?? o.error ?? "unknown")
          .join("; ")
        throw new Error(
          `Campaign ${campaignId}: ${result.failed} message(s) failed — ${errors}`,
        )
      }

      return result
    })
  },
)
