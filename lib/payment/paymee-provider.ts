/**
 * PaymeePaymentProvider — adaptateur RÉEL Paymee (PSP tunisien, paiement en
 * ligne TND par redirection hébergée). Implémente `PaymentProvider`
 * (lib/payment/provider.ts) exactement comme `VirtualPaymentProvider` —
 * jamais de confirmation locale : `createPayment()` ne fait qu'ouvrir une
 * session de paiement hébergée chez Paymee et renvoyer son URL ; seul le
 * webhook signé (app/api/payment/reservation-webhook/route.ts, vérification
 * check_sum dans paymee-signing.ts) confirme réellement un paiement.
 *
 * ⚠️ CONTRAT PARTIELLEMENT NON VÉRIFIABLE DANS CET ENVIRONNEMENT ⚠️
 * `https://www.paymee.tn`, `https://sandbox.paymee.tn` et
 * `https://app.paymee.tn` sont tous les trois bloqués par la politique
 * réseau de ce build (curl direct + WebFetch confirmés rejetés,
 * `connect_rejected`/403) — la documentation officielle et le sandbox n'ont
 * donc pas pu être consultés ni appelés depuis cette session. Le contrat
 * ci-dessous (endpoint, champs de requête/réponse) reprend ce que l'énoncé
 * de la tâche a communiqué explicitement (`POST .../api/v2/payments/create`,
 * `Authorization: Token <api_key>`, réponse contenant `payment_url`) —
 * jamais inventé au-delà de ça. Voir paymee-signing.ts pour l'avertissement
 * équivalent sur la vérification `check_sum` du webhook.
 *
 * Conséquence assumée si un nom de champ de requête est légèrement
 * différent du réel : l'appel `createPayment()` échoue proprement avec
 * `PAYMENT_DECLINED`/`PROVIDER_ERROR` (jamais un faux succès — la réponse
 * est validée par schéma avant toute confirmation) — à corriger dès
 * qu'un accès sandbox réel ou la doc primaire est disponible.
 */

import { siteOrigin } from "@/lib/mygo/config"
import type { CreatePaymentInput, PaymentProvider, PaymentResult, PaymentStatusResult } from "./provider"

export function isPaymeeSelected(): boolean {
  return process.env.PAYMENT_PROVIDER === "paymee"
}

export type PaymeeEnvironment = "sandbox" | "production"

export function getPaymeeEnvironment(): PaymeeEnvironment {
  return process.env.PAYMEE_ENVIRONMENT === "production" ? "production" : "sandbox"
}

/** URL de base — override explicite (`PAYMEE_BASE_URL`) sinon dérivée de
 * l'environnement (sandbox/production), jamais codée en dur ailleurs. */
export function resolvePaymeeBaseUrl(): string {
  const override = process.env.PAYMEE_BASE_URL
  if (override) return override.replace(/\/$/, "")
  return getPaymeeEnvironment() === "production" ? "https://app.paymee.tn" : "https://sandbox.paymee.tn"
}

/** URL publique du webhook — override explicite sinon dérivée de
 * `siteOrigin()` (même convention que Virtual Payment Provider). */
export function resolvePaymeeWebhookUrl(): string {
  const override = process.env.PAYMEE_WEBHOOK_URL
  if (override) return override
  return `${siteOrigin()}/api/payment/reservation-webhook?provider=paymee`
}

/** Page de retour générique (voir app/paiement-retour/[ref]/page.tsx) —
 * ne confirme JAMAIS rien elle-même, se contente de rediriger vers l'état
 * réel de la réservation (confirmée ou toujours en attente du webhook). */
function resolveReturnUrl(reference: string): string {
  return `${siteOrigin()}/paiement-retour/${encodeURIComponent(reference)}`
}

/** Normalise un numéro pour l'API Paymee (format local tunisien, sans
 * indicatif pays) — best-effort documenté, voir avertissement de fichier. */
function normalizePaymeePhone(raw: string | undefined): string {
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "")
  return digits.startsWith("216") && digits.length > 8 ? digits.slice(3) : digits
}

interface PaymeeCreateResponseData {
  token?: unknown
  payment_url?: unknown
}
interface PaymeeCreateResponse {
  status?: unknown
  message?: unknown
  data?: PaymeeCreateResponseData
}

function isValidCreateResponse(
  json: unknown,
): json is { status: true; data: { token: string; payment_url: string } } {
  if (!json || typeof json !== "object") return false
  const r = json as PaymeeCreateResponse
  return (
    r.status === true &&
    typeof r.data?.token === "string" &&
    r.data.token.length > 0 &&
    typeof r.data?.payment_url === "string" &&
    r.data.payment_url.length > 0
  )
}

export class PaymeePaymentProvider implements PaymentProvider {
  readonly name = "paymee"
  readonly configured: boolean

  private readonly apiKey: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(fetchImpl: typeof fetch = fetch) {
    this.apiKey = process.env.PAYMEE_API_KEY
    this.configured = Boolean(this.apiKey)
    this.fetchImpl = fetchImpl
    this.timeoutMs = Number(process.env.PAYMEE_TIMEOUT_MS ?? 15000)
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
        message: "PAYMEE_API_KEY manquant — paiement Paymee non disponible.",
      }
    }

    const url = `${resolvePaymeeBaseUrl()}/api/v2/payments/create`
    const body = {
      amount: Number(input.amountTnd.toFixed(3)),
      note: input.description,
      first_name: input.customerFirstName || "Client",
      last_name: input.customerLastName || "Easy2Book",
      email: input.customerEmail,
      phone: normalizePaymeePhone(input.customerPhone),
      order_id: input.reference,
      return_url: resolveReturnUrl(input.reference),
      cancel_url: resolveReturnUrl(input.reference),
      webhook_url: resolvePaymeeWebhookUrl(),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError"
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: aborted
          ? `Délai d'attente dépassé (${this.timeoutMs}ms) en contactant Paymee.`
          : `Erreur réseau Paymee : ${err instanceof Error ? err.message : "inconnue"}.`,
      }
    } finally {
      clearTimeout(timer)
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: `Réponse Paymee illisible (HTTP ${response.status}).`,
      }
    }

    if (!response.ok) {
      const message = json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : null
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: message ?? `Échec de création du paiement Paymee (HTTP ${response.status}).`,
      }
    }

    if (!isValidCreateResponse(json)) {
      const declined = json && typeof json === "object" && "status" in json && (json as { status: unknown }).status === false
      const message =
        json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : null
      return {
        ok: false,
        code: declined ? "PAYMENT_DECLINED" : "PROVIDER_ERROR",
        message: message ?? "Réponse Paymee inattendue — paiement non créé.",
      }
    }

    return {
      ok: true,
      status: "requires_action",
      providerPaymentId: json.data.token,
      psp: "paymee",
      redirectUrl: json.data.payment_url,
    }
  }

  /** Jamais de confirmation locale — seul le webhook signé confirme (voir
   * note de fichier). Même contrat honnête que VirtualPaymentProvider. */
  async confirmPayment(): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message: "Confirmation via webhook Paymee uniquement.",
    }
  }

  /** Remboursement Paymee non implémenté — aucune doc de l'API de
   * remboursement n'a pu être vérifiée (voir avertissement de fichier) ;
   * jamais fabriqué. À traiter manuellement via le back-office Paymee en
   * attendant, ou à implémenter une fois le contrat confirmé. */
  async refundPayment(): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message:
        "Remboursement Paymee non implémenté (API de remboursement non vérifiée) — traiter manuellement via le back-office Paymee.",
    }
  }

  /** Idem — aucun endpoint de statut Paymee vérifié ; jamais de transaction
   * fantôme rapportée. */
  async getPaymentStatus(): Promise<PaymentStatusResult> {
    return { found: false }
  }
}
