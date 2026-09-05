/**
 * Tests unitaires — `lib/payment/paymee-provider.ts`.
 *
 * `PaymeePaymentProvider` accepte un `fetchImpl` injectable (jamais le vrai
 * réseau dans ces tests) — permet de couvrir succès/erreur API/timeout/
 * réponse invalide sans dépendre d'un accès réel à sandbox.paymee.tn
 * (bloqué dans cet environnement, voir avertissement de fichier dans
 * paymee-provider.ts). Aucun de ces tests ne prouve que le VRAI Paymee se
 * comporte ainsi — ils prouvent que l'ADAPTATEUR gère correctement chacun
 * de ces cas de réponse HTTP.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { PaymeePaymentProvider, isPaymeeSelected, resolvePaymeeBaseUrl, getPaymeeEnvironment } from "../paymee-provider"

const BASE_INPUT = {
  amountTnd: 150.5,
  currency: "TND" as const,
  reference: "guest-test-ref",
  description: "Réservation hôtel — test",
  customerEmail: "client@example.com",
  customerFirstName: "Jean",
  customerLastName: "Dupont",
  customerPhone: "+21698123456",
}

function withPaymeeEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

function fakeFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {})) as typeof fetch
}

test("isPaymeeSelected : false par défaut, true uniquement si PAYMENT_PROVIDER=paymee", () => {
  withPaymeeEnv({ PAYMENT_PROVIDER: undefined }, () => {
    assert.equal(isPaymeeSelected(), false)
  })
  withPaymeeEnv({ PAYMENT_PROVIDER: "stripe" }, () => {
    assert.equal(isPaymeeSelected(), false)
  })
  withPaymeeEnv({ PAYMENT_PROVIDER: "paymee" }, () => {
    assert.equal(isPaymeeSelected(), true)
  })
})

test("configuration sandbox/live (item 14) : PAYMEE_ENVIRONMENT sélectionne la bonne URL de base", () => {
  withPaymeeEnv({ PAYMEE_ENVIRONMENT: undefined, PAYMEE_BASE_URL: undefined }, () => {
    assert.equal(getPaymeeEnvironment(), "sandbox")
    assert.equal(resolvePaymeeBaseUrl(), "https://sandbox.paymee.tn")
  })
  withPaymeeEnv({ PAYMEE_ENVIRONMENT: "production", PAYMEE_BASE_URL: undefined }, () => {
    assert.equal(getPaymeeEnvironment(), "production")
    assert.equal(resolvePaymeeBaseUrl(), "https://app.paymee.tn")
  })
  withPaymeeEnv({ PAYMEE_ENVIRONMENT: "production", PAYMEE_BASE_URL: "https://override.example.com/" }, () => {
    // Override explicite gagne toujours, quel que soit l'environnement.
    assert.equal(resolvePaymeeBaseUrl(), "https://override.example.com")
  })
})

test("createPayment (item 13) : absence de PAYMEE_API_KEY -> PAYMENT_PROVIDER_NOT_CONFIGURED, jamais un appel réseau", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: undefined }, async () => {
    let called = false
    const provider = new PaymeePaymentProvider(fakeFetch(() => {
      called = true
      throw new Error("ne doit jamais être appelé")
    }))
    assert.equal(provider.configured, false)
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PAYMENT_PROVIDER_NOT_CONFIGURED")
    assert.equal(called, false)
  })
})

test("createPayment (item 1) : succès — requires_action + redirectUrl = payment_url, providerPaymentId = token", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key" }, async () => {
    let capturedUrl = ""
    let capturedAuth = ""
    let capturedBody: Record<string, unknown> = {}
    const provider = new PaymeePaymentProvider(fakeFetch((url, init) => {
      capturedUrl = url
      capturedAuth = (init.headers as Record<string, string>)?.Authorization ?? ""
      capturedBody = JSON.parse(init.body as string)
      return new Response(
        JSON.stringify({ status: true, data: { token: "tok_xyz", payment_url: "https://sandbox.paymee.tn/gateway/tok_xyz" } }),
        { status: 200 },
      )
    }))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, true)
    assert.equal(result.status, "requires_action")
    assert.equal(result.psp, "paymee")
    assert.equal(result.providerPaymentId, "tok_xyz")
    assert.equal(result.redirectUrl, "https://sandbox.paymee.tn/gateway/tok_xyz")

    assert.equal(capturedUrl, "https://sandbox.paymee.tn/api/v2/payments/create")
    assert.equal(capturedAuth, "Token fake_key")
    assert.equal(capturedBody.order_id, "guest-test-ref")
    assert.equal(capturedBody.amount, 150.5)
    assert.equal(capturedBody.email, "client@example.com")
    // La clé API n'est JAMAIS renvoyée au client dans le résultat.
    assert.equal(JSON.stringify(result).includes("fake_key"), false)
  })
})

test("createPayment (item 2) : erreur API Paymee (HTTP non-2xx) -> PROVIDER_ERROR, jamais un succès fabriqué", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key" }, async () => {
    const provider = new PaymeePaymentProvider(fakeFetch(() =>
      new Response(JSON.stringify({ message: "Invalid merchant" }), { status: 401 }),
    ))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PROVIDER_ERROR")
    assert.match(result.message ?? "", /Invalid merchant/)
  })
})

test("createPayment (item 3) : timeout réseau -> PROVIDER_ERROR explicite, jamais une exception qui s'échappe", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key", PAYMEE_TIMEOUT_MS: "50" }, async () => {
    const provider = new PaymeePaymentProvider(fakeFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })
    }))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PROVIDER_ERROR")
    assert.match(result.message ?? "", /[Dd]élai/)
  })
})

test("createPayment (item 4) : réponse 200 mais forme invalide (token/payment_url absents) -> PROVIDER_ERROR", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key" }, async () => {
    const provider = new PaymeePaymentProvider(fakeFetch(() =>
      new Response(JSON.stringify({ status: true, data: {} }), { status: 200 }),
    ))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PROVIDER_ERROR")
  })
})

test("createPayment : status:false (décliné côté Paymee) -> PAYMENT_DECLINED, pas PROVIDER_ERROR", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key" }, async () => {
    const provider = new PaymeePaymentProvider(fakeFetch(() =>
      new Response(JSON.stringify({ status: false, message: "Montant invalide" }), { status: 200 }),
    ))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PAYMENT_DECLINED")
    assert.match(result.message ?? "", /Montant invalide/)
  })
})

test("createPayment : JSON illisible -> PROVIDER_ERROR, jamais une exception", async () => {
  await withPaymeeEnv({ PAYMEE_API_KEY: "fake_key" }, async () => {
    const provider = new PaymeePaymentProvider(fakeFetch(() => new Response("not json", { status: 200 })))
    const result = await provider.createPayment(BASE_INPUT)
    assert.equal(result.ok, false)
    assert.equal(result.code, "PROVIDER_ERROR")
  })
})

test("confirmPayment/refundPayment/getPaymentStatus : jamais de confirmation/statut local — seul le webhook signé fait foi", async () => {
  const provider = new PaymeePaymentProvider()
  assert.equal((await provider.confirmPayment()).ok, false)
  assert.equal((await provider.refundPayment()).ok, false)
  assert.equal((await provider.getPaymentStatus()).found, false)
})
