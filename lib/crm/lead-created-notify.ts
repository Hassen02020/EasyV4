/**
 * CRM-LEAD-NOTIFY-CHANNELS-01 (écart G-03) — émet `crm/lead.created` pour un
 * lead QUI VIENT D'ÊTRE CRÉÉ par un canal entrant (Lead Ads, WhatsApp,
 * Messenger, Instagram, email entrant). Appelé APRÈS le commit de la
 * transaction de capture : la charge utile est relue en base (jamais
 * reconstruite à partir du webhook).
 *
 * Doublons : l'id d'événement est stable par lead (`sendEventReliable`,
 * `crm/lead.created:<leadId>`) — un webhook rejoué ne produit pas un second
 * email. Les appelants n'appellent cette fonction que sur une création
 * réelle (jamais sur un lead existant ou un webhook déjà traité).
 *
 * Ne lève JAMAIS : un webhook doit répondre 200 même si la notification
 * échoue (l'échec d'envoi est tracé par `sendEventReliable`).
 */

import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { leads } from "@/lib/db/schema"
import {
  sendEventReliable,
  type ReliableSendDeps,
} from "@/lib/inngest/send-reliable"
import type { LeadNotifyChannel } from "./lead-notify-channel"

export async function notifyLeadCreated(
  params: { agencyId: string; leadId: string; channel: LeadNotifyChannel },
  deps: ReliableSendDeps = {},
): Promise<void> {
  try {
    const [lead] = await withSystemContext((tx) =>
      tx
        .select({
          firstName: leads.firstName,
          lastName: leads.lastName,
          email: leads.email,
          phone: leads.phone,
          message: leads.message,
          productType: leads.productType,
          productLabel: leads.productLabel,
          sourcePage: leads.sourcePage,
        })
        .from(leads)
        .where(
          and(eq(leads.id, params.leadId), eq(leads.agencyId, params.agencyId)),
        )
        .limit(1),
    )
    if (!lead) return

    await sendEventReliable(
      "crm/lead.created",
      {
        leadId: params.leadId,
        agencyId: params.agencyId,
        channel: params.channel,
        ...lead,
      },
      { leadId: params.leadId, agencyId: params.agencyId },
      deps,
    )
  } catch (err) {
    console.error("[notifyLeadCreated]", params.channel, err)
  }
}
