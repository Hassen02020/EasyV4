/**
 * PaymeePaymentProvider — adaptateur RÉEL Paymee (PSP tunisien, paiement en
 * ligne TND par redirection hébergée). Implémente `PaymentProvider`
 * (lib/payment/provider.ts) exactement comme `VirtualPaymentProvider` —
 * jamais de confirmation locale : `createPayment()` ne fait qu'ouvrir une
 * session de paiement hébergée chez Paymee et renvoyer son URL ; seul le
 * webhook signé (app/api/payment/reservation-webhook/route.ts, vérification
 * check_sum dans paymee-signing.ts) confirme réellement un paiement.
 *
 * Contrat vérifié contre la documentation officielle Paymee (fournie
 * directement par l'utilisateur — endpoints, headers, champs de requête et
 * de réponse ci-dessous) : `POST /api/v2/payments/create`,
 * `Authorization: Token <api_key>`, `sandbox.paymee.tn` / `app.paymee.tn`,
 * champs requête (amount, note, first_name, last_name, email, phone,
 * return_url, cancel_url, webhook_url, order_id optionnel) et réponse
 * (`status`, `data.token`, `data.payment_url`) — tous confirmés identiques
 * à l'implémentation déjà en place. Remboursement et vérification de statut
 * restent non implémentés (aucun endpoint documenté fourni pour ces deux
 * opérations) — voir refundPayment()/getPaymentStatus() ci-dessous.
 */

import { siteOrigin } from "@/lib/mygo/config"
import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  PaymentStatusResult,
} from "./provider"

export function isPaymeeSelected(): boolean {
  return process.env.PAYMENT_PROVIDER === "paymee"
}

export type PaymeeEnvironment = "sandbox" | "production"

export function getPaymeeEnvironment(): PaymeeEnvironment {
  return process.env.PAYMEE_ENVIRONMENT === "production"
    ? "production"
    : "sandbox"
}

/** URL de base — override explicite (`PAYMEE_BASE_URL`) sinon dérivée de
 * l'environnement (sandbox/production), jamais codée en dur ailleurs. */
export function resolvePaymeeBaseUrl(): string {
  const override = process.env.PAYMEE_BASE_URL
  if (override) return override.replace(/\/$/, "")
  return getPaymeeEnvironment() === "production"
    ? "https://app.paymee.tn"
    : "https://sandbox.paymee.tn"
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
  return digits.startsWith("216") && digits.length > 8
    ? digits.slice(3)
    : digits
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

interface PaymeeStatusResponseData {
  token?: unknown
  payment_status?: unknown
  amount?: unknown
  received_amount?: unknown
}
interface PaymeeStatusResponse {
  status?: unknown
  data?: PaymeeStatusResponseData
}

/** Extrait un statut normalisé depuis une réponse GET /api/v2/payments/{token}.
 * Fail-closed : tout ce qui ne correspond pas exactement au contrat connu
 * retourne `{ found: false }` — jamais un statut inventé. */
function parseStatusResponse(
  json: unknown,
): { found: true; status: "pending" | "succeeded"; amountTnd: number } | { found: false } {
  if (!json || typeof json !== "object") return { found: false }
  const r = json as PaymeeStatusResponse
  if (r.status !== true || !r.data || typeof r.data !== "object") {
    return { found: false }
  }
  const d = r.data
  // amount réel capturé : received_amount si disponible, sinon amount
  const rawAmount = typeof d.received_amount === "number"
    ? d.received_amount
    : typeof d.amount === "number"
      ? d.amount
      : null
  if (rawAmount === null) return { found: false }
  // payment_status : true = paiement réussi, false = en attente/échoué
  const succeeded = d.payment_status === true
  return {
    found: true,
    status: succeeded ? "succeeded" : "pending",
    amountTnd: rawAmount,
  }
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
      // PAY-WEBHOOK-SAFETY-01 / P0-C — même précision que la colonne DB
      // (decimal scale:2). Envoyer toFixed(3) créait un écart entre le montant
      // stocké en DB (arrondi à 2 décimales) et le montant retourné par
      // `received_amount` dans le webhook Paymee, ce qui dépassait la
      // tolérance matchesPendingPayment (0.001 TND) et marquait le paiement
      // échoué à tort.
      amount: Number(input.amountTnd.toFixed(2)),
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
      const message =
        json && typeof json === "object" && "message" in json
          ? String((json as { message: unknown }).message)
          : null
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message:
          message ??
          `Échec de création du paiement Paymee (HTTP ${response.status}).`,
      }
    }

    if (!isValidCreateResponse(json)) {
      const declined =
        json &&
        typeof json === "object" &&
        "status" in json &&
        (json as { status: unknown }).status === false
      const message =
        json && typeof json === "object" && "message" in json
          ? String((json as { message: unknown }).message)
          : null
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

  /** Paymee ne fournit pas d'API de remboursement programmatique (aucun
   * endpoint documenté, confirmé par l'absence dans la doc officielle
   * fournie). Les remboursements se traitent via le back-office Paymee
   * (app.paymee.tn / sandbox.paymee.tn → Tableau de bord → Transactions).
   * Cette méthode reste honnête : jamais un succès simulé. */
  async refundPayment(
    _providerPaymentId?: string,
    _amountTnd?: number,
  ): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message:
        "L'API Paymee ne propose pas de remboursement programmatique. Traiter via le tableau de bord Paymee (Transactions → Rembourser).",
    }
  }

  /** Interroge `GET /api/v2/payments/{token}` pour connaître le statut actuel
   * d'un paiement. Fail-closed : toute réponse imprévue (réseau, forme
   * inattendue, clé absente) retourne `{ found: false }` — jamais un statut
   * inventé (règle anti-fabrication — voir note de fichier). */
  async getPaymentStatus(
    providerPaymentId: string,
  ): Promise<PaymentStatusResult> {
    if (!this.apiKey) return { found: false }

    const url = `${resolvePaymeeBaseUrl()}/api/v2/payments/${encodeURIComponent(providerPaymentId)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Token ${this.apiKey}` },
        signal: controller.signal,
      })
    } catch {
      return { found: false }
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) return { found: false }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return { found: false }
    }

    return parseStatusResponse(json)
  }
}
