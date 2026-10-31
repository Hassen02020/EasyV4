/**
 * CRM-SOCIAL-CODE-FIX-01 — lecture des événements `messaging` des webhooks
 * Messenger (`object: "page"`) et Instagram (`object: "instagram"`), même
 * structure `entry[*].messaging[*]` chez Meta.
 *
 * Ne retient que les messages texte REÇUS d'un client :
 *  - écho (`message.is_echo`) = message envoyé PAR la Page (réponse de
 *    l'agence) → ignoré, sinon il serait enregistré comme message du client
 *    et relancerait à tort la fenêtre de service de 24 h ;
 *  - sans expéditeur, sans `mid` ou sans texte (pièce jointe, réaction,
 *    accusé de lecture) → ignoré (comportement inchangé).
 *
 * `timestamp` Meta pour Messenger / Instagram = MILLISECONDES depuis l'epoch
 * (contrairement à WhatsApp, en secondes). L'ancien code le multipliait par
 * 1000 : dates dans un futur lointain (fenêtre 24 h toujours ouverte, tri
 * faussé).
 */

export interface MetaMessagingPayload {
  object?: string
  entry?: Array<{
    id?: string
    messaging?: Array<{
      sender?: { id?: string }
      recipient?: { id?: string }
      timestamp?: number
      message?: { mid?: string; text?: string; is_echo?: boolean }
    }>
  }>
}

export interface MetaInboundMessage {
  senderId: string
  mid: string
  text: string
  sentAt: Date
}

export function extractMetaInboundMessages(
  payload: MetaMessagingPayload,
  now: () => Date = () => new Date(),
): MetaInboundMessage[] {
  const out: MetaInboundMessage[] = []
  for (const event of payload.entry?.flatMap((e) => e.messaging ?? []) ?? []) {
    const senderId = event.sender?.id
    const mid = event.message?.mid
    const text = event.message?.text
    if (!senderId || !mid || !text) continue
    if (event.message?.is_echo) continue
    out.push({
      senderId,
      mid,
      text,
      sentAt:
        typeof event.timestamp === "number" && event.timestamp > 0
          ? new Date(event.timestamp)
          : now(),
    })
  }
  return out
}
