/**
 * WHATSAPP-CRM-01 — lecture des notifications WhatsApp Cloud API entrantes,
 * fonction pure (testée seule, sans base ni réseau).
 *
 * - W-03 : seul l'objet `whatsapp_business_account` est lu ; quand
 *   `WHATSAPP_PHONE_NUMBER_ID` est configuré, une notification adressée à un
 *   autre numéro (metadata.phone_number_id) est écartée et signalée.
 * - W-06 : les messages non texte ne disparaissent plus en silence. Le
 *   texte d'un bouton ou d'une réponse interactive est repris tel quel ;
 *   une photo, un audio, une vidéo, un document, un autocollant, une
 *   localisation ou une fiche contact donne une ligne de substitution
 *   (avec la légende éventuelle), pour que l'agent voie que le client a
 *   écrit. Aucun média n'est téléchargé. Les réactions, messages système
 *   et types non pris en charge restent ignorés.
 * - Les accusés (`statuses`) ne sont pas des messages : ignorés.
 */

export interface WhatsAppWebhookPayload {
  object?: string
  entry?: Array<{
    changes?: Array<{
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
        messages?: Array<WhatsAppRawMessage>
        /** Accusés de livraison / lecture — jamais lus comme des messages. */
        statuses?: unknown[]
      }
    }>
  }>
}

export interface WhatsAppRawMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string }
  }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
}

export interface WhatsAppInboundMessage {
  from: string
  id: string
  /** Secondes Unix (format WhatsApp), null si absent. */
  timestamp: string | null
  body: string
  contactName: string | null
}

export interface WhatsAppIgnoredNotification {
  reason: "not_whatsapp_object" | "foreign_phone_number"
  phoneNumberId: string | null
}

const MEDIA_LABELS: Record<string, string> = {
  image: "Photo reçue",
  audio: "Message audio reçu",
  video: "Vidéo reçue",
  document: "Document reçu",
  sticker: "Autocollant reçu",
  location: "Localisation reçue",
  contacts: "Fiche contact reçue",
}

/** Texte à enregistrer pour un message, ou null s'il doit être ignoré. */
export function whatsAppMessageBody(
  message: WhatsAppRawMessage,
): string | null {
  switch (message.type) {
    case "text":
      return message.text?.body?.trim() || null
    case "button":
      return message.button?.text?.trim() || null
    case "interactive":
      return (
        message.interactive?.button_reply?.title?.trim() ||
        message.interactive?.list_reply?.title?.trim() ||
        null
      )
    default: {
      const label = message.type ? MEDIA_LABELS[message.type] : undefined
      if (!label) return null
      const caption =
        message.image?.caption ||
        message.video?.caption ||
        message.document?.caption ||
        ""
      return caption.trim()
        ? `[${label} — à consulter sur WhatsApp] ${caption.trim()}`
        : `[${label} — à consulter sur WhatsApp]`
    }
  }
}

export function extractWhatsAppInboundMessages(
  payload: WhatsAppWebhookPayload,
  expectedPhoneNumberId: string | null,
): {
  messages: WhatsAppInboundMessage[]
  ignored: WhatsAppIgnoredNotification[]
} {
  const messages: WhatsAppInboundMessage[] = []
  const ignored: WhatsAppIgnoredNotification[] = []
  if (payload.object !== "whatsapp_business_account") {
    ignored.push({ reason: "not_whatsapp_object", phoneNumberId: null })
    return { messages, ignored }
  }
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const value = change.value
    if (!value?.messages?.length) continue
    const phoneNumberId = value.metadata?.phone_number_id ?? null
    if (expectedPhoneNumberId && phoneNumberId !== expectedPhoneNumberId) {
      ignored.push({ reason: "foreign_phone_number", phoneNumberId })
      continue
    }
    const names = new Map<string, string | undefined>()
    for (const contact of value.contacts ?? []) {
      if (contact.wa_id) names.set(contact.wa_id, contact.profile?.name)
    }
    for (const message of value.messages) {
      if (!message.from || !message.id) continue
      const body = whatsAppMessageBody(message)
      if (!body) continue
      messages.push({
        from: message.from,
        id: message.id,
        timestamp: message.timestamp ?? null,
        body,
        contactName: names.get(message.from) ?? null,
      })
    }
  }
  return { messages, ignored }
}
