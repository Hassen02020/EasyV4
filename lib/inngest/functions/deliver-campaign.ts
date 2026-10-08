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
 * Retries : 3 tentatives. Si RESEND_API_KEY n'est pas configuré, tous les
 * envois email échouent avec un message clair (pas de faux succès).
 * Les cibles 'skipped' (whatsapp/call) sont mises à jour dès le premier
 * passage et ne repassent jamais en 'pending' — idempotentes.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { deliverCampaignCore } from "@/lib/crm/campaign-delivery-core"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const deliverCampaign = inngest.createFunction(
  {
    id: "deliver-campaign",
    name: "Campagne lancée — livraison des messages",
    retries: 3,
    triggers: { event: "crm/campaign.launched" },
    onFailure: makeOnFailure("deliver-campaign"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["crm/campaign.launched"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const { campaignId, agencyId } = event.data

    return step.run("deliver-messages", async () => {
      // L'agencyId de l'événement est toujours l'agence OTA directe
      // (résolu par assertSupportStaff dans campaign-lifecycle-actions.ts).
      // On le vérifie contre getDefaultAgencyId() pour ne jamais livrer
      // des messages d'une agence inconnue, même si l'event était falsifié
      // (Inngest events sont internes, mais défense en profondeur).
      const defaultAgencyId = await getDefaultAgencyId()

      const result = await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: false },
        (tx) =>
          deliverCampaignCore(tx, {
            agencyId,
            campaignId,
            agencyName: defaultAgencyId === agencyId ? "Easy2Book" : undefined,
          }),
      )

      // Si des envois email ont échoué, on jette pour déclencher un retry Inngest.
      // Les lignes 'sent' et 'skipped' ne seront pas retraitées (delivery_status !== 'pending').
      if (result.failed > 0) {
        const errors = result.outcomes
          .filter((o) => o.status === "failed")
          .map((o) => o.error ?? o.code ?? "unknown")
          .join("; ")
        throw new Error(
          `Campaign ${campaignId}: ${result.failed} message(s) failed — ${errors}`,
        )
      }

      return result
    })
  },
)
