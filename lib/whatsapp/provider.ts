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

import { normalizePhoneRefCore } from "@/lib/crm/contact-core"
import {
  parseMetaGraphError,
  type MetaGraphErrorInfo,
} from "@/lib/meta-leadads/provider"
import { metaGraphUrl } from "@/lib/meta/graph"

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

export interface SendSessionMessageInput {
  /** Numéro destinataire, format libre — normalisé en interne. */
  to: string
  /** Texte libre — n'est accepté par l'API Meta QUE dans la fenêtre de
   * service de 24h suivant le dernier message du client (voir
   * canSendSessionMessage, lib/crm/inbox-core.ts) ; l'appelant doit
   * vérifier cette fenêtre AVANT d'appeler cette méthode, jamais ici (pas
   * d'accès DB dans ce fichier). */
  body: string
}

export interface WhatsAppMessageResult {
  ok: boolean
  code?: WhatsAppProviderCode
  message?: string
  /** wamid — identifiant du message côté Meta. Absent si `ok: false`. */
  providerMessageId?: string
  /**
   * WHATSAPP-CRM-01 (W-04) — diagnostic Meta filtré (statut HTTP, code,
   * sous-code, type, fbtrace_id). Jamais le message brut ni le jeton.
   */
  graph?: MetaGraphErrorInfo
}

/**
 * WHATSAPP-CRM-01 (W-08) — un échec est-il temporaire (à relancer) ?
 * Numéro invalide, configuration absente, refus 4xx de Meta (hors 429,
 * limite de débit) : définitifs. Erreur réseau, 429, 5xx : temporaires.
 */
export function isRetryableWhatsAppFailure(
  result: WhatsAppMessageResult,
): boolean {
  if (result.ok) return false
  if (result.code !== "WHATSAPP_SEND_FAILED") return false
  const status = result.graph?.status
  if (status === undefined) return true
  return status === 429 || status >= 500
}

/**
 * Contrat minimal qu'un fournisseur WhatsApp doit implémenter. Aucune
 * méthode ne doit jamais retourner `ok: true` sans confirmation réelle
 * du provider — pas de simulation locale.
 */
export interface WhatsAppProvider {
  readonly name: string
  readonly configured: boolean
  sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<WhatsAppMessageResult>
  sendSessionMessage(
    input: SendSessionMessageInput,
  ): Promise<WhatsAppMessageResult>
}

/**
 * Normalise un numéro pour l'API Meta : chiffres uniquement, sans "+"
 * (format attendu par `to` dans le payload Cloud API). `null` si le
 * résultat n'a pas une longueur plausible pour un numéro E.164 (8 à 15
 * chiffres, indicatif pays inclus) — jamais d'envoi vers un numéro
 * manifestement mal formé.
 */
/**
 * WHATSAPP-CRM-01 (W-01) — numéro au format attendu par WhatsApp : chiffres
 * seuls, indicatif pays inclus. Réutilise `normalizePhoneRefCore`
 * (contact-core.ts) : un numéro tunisien saisi sans indicatif
 * (« 98 140 514 ») ou avec 00216 devient 216XXXXXXXX. Un préfixe
 * international « 00 » est retiré. Longueur hors 10–15 chiffres → null
 * (aucun numéro fabriqué).
 */
export function normalizeWhatsAppPhone(raw: string): string | null {
  let digits = normalizePhoneRefCore(raw).replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (digits.length < 10 || digits.length > 15) return null
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

  async sendSessionMessage(): Promise<WhatsAppMessageResult> {
    return {
      ok: false,
      code: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
      message:
        "Réponse WhatsApp non disponible (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID absents).",
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

  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<WhatsAppMessageResult> {
    const to = normalizeWhatsAppPhone(input.to)
    if (!to) {
      return {
        ok: false,
        code: "WHATSAPP_INVALID_PHONE",
        // W-02 : jamais le numéro saisi dans le message (il finit dans
        // les traces d'audit).
        message: "Numéro invalide pour l'envoi WhatsApp.",
      }
    }

    return this.postMessage({
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
                  parameters: input.bodyParams.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ],
            }
          : {}),
      },
    })
  }

  async sendSessionMessage(
    input: SendSessionMessageInput,
  ): Promise<WhatsAppMessageResult> {
    const to = normalizeWhatsAppPhone(input.to)
    if (!to) {
      return {
        ok: false,
        code: "WHATSAPP_INVALID_PHONE",
        // W-02 : jamais le numéro saisi dans le message (il finit dans
        // les traces d'audit).
        message: "Numéro invalide pour l'envoi WhatsApp.",
      }
    }

    return this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: input.body },
    })
  }

  private async postMessage(
    body: Record<string, unknown>,
  ): Promise<WhatsAppMessageResult> {
    // W-07 : une seule construction d'URL Graph (lib/meta/graph.ts).
    const url = metaGraphUrl(
      `${encodeURIComponent(this.phoneNumberId)}/messages`,
      this.apiVersion,
    )

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
        message:
          err instanceof Error
            ? `Erreur réseau : ${err.message}`
            : "Erreur réseau inconnue.",
      }
    }

    const json = (await response.json().catch(() => null)) as {
      messages?: Array<{ id: string }>
      error?: unknown
    } | null

    if (!response.ok || !json?.messages?.[0]?.id) {
      // W-04 : diagnostic filtré ; message générique (le message brut de
      // Meta peut citer le destinataire).
      const graph = parseMetaGraphError(response.status, json)
      return {
        ok: false,
        code: "WHATSAPP_SEND_FAILED",
        message: `Échec de l'envoi WhatsApp (HTTP ${response.status}${
          graph.code !== undefined ? `, code Meta ${graph.code}` : ""
        }).`,
        graph,
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
  return (
    Boolean(process.env.WHATSAPP_ACCESS_TOKEN) &&
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)
  )
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
      // Vide = version Meta commune (META_GRAPH_API_VERSION, v21.0 par défaut).
      process.env.WHATSAPP_API_VERSION || "",
    )
  }
  return new NotConfiguredWhatsAppProvider()
}
