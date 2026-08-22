/**
 * WhatsAppProvider — abstraction pour les notifications WhatsApp client.
 *
 * Branche "WhatsApp" du diagramme cible EASY2BOOK (Event/Retry Engine →
 * Email / WhatsApp / CRM) — jusqu'ici seule la branche Email (Resend,
 * lib/email/send-voucher.ts) existait réellement. Contrairement à
 * lib/payment/provider.ts (aucun adaptateur réel branché faute de contrat
 * d'API vérifié pour SPS et de support TND chez Stripe), l'API Meta
 * WhatsApp Business Cloud est publique, stable et documentée
 * (https://developers.facebook.com/docs/whatsapp/cloud-api) — un
 * adaptateur réel a donc du sens ici, pas une supposition.
 *
 * Contrainte réelle de la plateforme WhatsApp (pas une limitation de ce
 * code) : un message initié par l'entreprise (hors fenêtre de service
 * client de 24h suivant un message du client) DOIT utiliser un template
 * pré-approuvé dans le Meta Business Manager — un texte libre serait
 * rejeté par l'API. `templateName`/`languageCode` sont donc toujours
 * fournis par l'appelant (jamais codés en dur ici) et doivent correspondre
 * à un template réellement approuvé sur le compte configuré.
 *
 * Comportement honnête tant que `WHATSAPP_ACCESS_TOKEN`/
 * `WHATSAPP_PHONE_NUMBER_ID` ne sont pas configurés :
 * `WHATSAPP_PROVIDER_NOT_CONFIGURED` — jamais un faux succès.
 */

export type WhatsAppProviderCode =
  | "WHATSAPP_PROVIDER_NOT_CONFIGURED"
  | "WHATSAPP_INVALID_PHONE"
  | "WHATSAPP_SEND_FAILED"

export interface SendTemplateMessageInput {
  /** Numéro destinataire, format libre (tel que saisi par le client) — normalisé en interne. */
  to: string
  /** Nom exact du template approuvé côté Meta Business Manager. */
  templateName: string
  /** Code langue du template (ex. "fr", "fr_FR") — doit correspondre au template approuvé. */
  languageCode: string
  /** Paramètres positionnels du corps du template, dans l'ordre des {{1}}, {{2}}, ... */
  bodyParams: string[]
}

export interface WhatsAppMessageResult {
  ok: boolean
  code?: WhatsAppProviderCode
  message?: string
  /** wamid — identifiant du message côté Meta. Absent si `ok: false`. */
  providerMessageId?: string
}

/**
 * Contrat minimal qu'un fournisseur WhatsApp doit implémenter. Aucune
 * méthode ne doit jamais retourner `ok: true` sans confirmation réelle
 * du provider — pas de simulation locale.
 */
export interface WhatsAppProvider {
  readonly name: string
  readonly configured: boolean
  sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppMessageResult>
}

/**
 * Normalise un numéro pour l'API Meta : chiffres uniquement, sans "+"
 * (format attendu par `to` dans le payload Cloud API). `null` si le
 * résultat n'a pas une longueur plausible pour un numéro E.164 (8 à 15
 * chiffres, indicatif pays inclus) — jamais d'envoi vers un numéro
 * manifestement mal formé.
 */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/**
 * Provider honnête par défaut — utilisé tant qu'aucun credential Meta réel
 * n'est configuré. Ne fabrique jamais de succès.
 */
class NotConfiguredWhatsAppProvider implements WhatsAppProvider {
  readonly name = "not_configured"
  readonly configured = false

  async sendTemplateMessage(): Promise<WhatsAppMessageResult> {
    return {
      ok: false,
      code: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
      message:
        "Notification WhatsApp non disponible (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID absents).",
    }
  }
}

/**
 * Adaptateur réel — Meta WhatsApp Business Cloud API.
 * Référence : POST /{phone-number-id}/messages
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta_cloud_api"
  readonly configured = true

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly apiVersion: string,
  ) {}

  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppMessageResult> {
    const to = normalizeWhatsAppPhone(input.to)
    if (!to) {
      return {
        ok: false,
        code: "WHATSAPP_INVALID_PHONE",
        message: `Numéro invalide pour l'envoi WhatsApp : "${input.to}".`,
      }
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(input.bodyParams.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: input.bodyParams.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      return {
        ok: false,
        code: "WHATSAPP_SEND_FAILED",
        message: err instanceof Error ? `Erreur réseau : ${err.message}` : "Erreur réseau inconnue.",
      }
    }

    const json = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } }
      | null

    if (!response.ok || !json?.messages?.[0]?.id) {
      return {
        ok: false,
        code: "WHATSAPP_SEND_FAILED",
        message: json?.error?.message ?? `Échec de l'envoi WhatsApp (HTTP ${response.status}).`,
      }
    }

    return { ok: true, providerMessageId: json.messages[0].id }
  }
}

/**
 * Résout si un fournisseur WhatsApp réel semble configuré (présence des
 * credentials attendus, jamais leur validité). Seule une vraie tentative
 * d'appel confirmerait la validité, ce que cette fonction pure ne fait
 * jamais.
 */
export function hasConfiguredWhatsAppProvider(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN) && Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)
}

/**
 * Point d'entrée unique. Retourne toujours un `WhatsAppProvider` valide —
 * l'adaptateur Meta réel dès que les credentials sont présents, sinon le
 * provider "non configuré" honnête.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (hasConfiguredWhatsAppProvider()) {
    return new MetaWhatsAppProvider(
      process.env.WHATSAPP_ACCESS_TOKEN!,
      process.env.WHATSAPP_PHONE_NUMBER_ID!,
      process.env.WHATSAPP_API_VERSION || "v21.0",
    )
  }
  return new NotConfiguredWhatsAppProvider()
}
