#!/usr/bin/env node
/**
 * error-simulation.mjs
 *
 * Simule des pannes de services externes pour valider les
 * ErrorBoundaries, fallbacks et comportements dégradés.
 *
 * Scénarios :
 *   1. Webhook tiers renvoie 500 (mock server)
 *   2. API myGo timeout / circuit breaker
 *   3. DB indisponible (via proxy d'env)
 *
 * Usage :
 *   node scripts/error-simulation.mjs
 *   node scripts/error-simulation.mjs --scenario webhook
 *   node scripts/error-simulation.mjs --scenario db
 */

import http from "http"
import { spawn } from "child_process"

const rawArgs = process.argv.slice(2)
const SCENARIO = rawArgs.find((_, i) => rawArgs[i - 1] === "--scenario") ?? "all"
const APP_PORT = process.env.APP_PORT ?? 3000
const MOCK_PORT = 9999

/* ─── helpers ─── */

function startMockWebhook() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      console.log(`[MOCK] ${req.method} ${req.url}`)
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "Internal Server Error", scenario: "webhook_failure" }))
    })
    server.listen(MOCK_PORT, () => {
      console.log(`🎭 Mock webhook DOWN sur http://localhost:${MOCK_PORT}/webhook`)
      resolve(server)
    })
  })
}

function startMockTimeout() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Ne répond jamais → timeout côté client
      console.log(`[MOCK] ${req.method} ${req.url} → timeout (pas de réponse)`)
    })
    server.listen(MOCK_PORT + 1, () => {
      console.log(`🐌 Mock API TIMEOUT sur http://localhost:${MOCK_PORT + 1}/api`)
      resolve(server)
    })
  })
}

async function testWebhookFailure() {
  console.log("\n📡 SCÉNARIO 1 : Webhook tiers retourne 500\n")
  const mock = await startMockWebhook()

  try {
    const res = await fetch(`http://localhost:${MOCK_PORT}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "payment.completed" }),
    })
    const body = await res.json()
    console.log(`   Status : ${res.status}`)
    console.log(`   Body   :`, body)
    console.log(`   ✅ Votre app doit logger l'erreur et retry/retry-queue.`)
  } catch (err) {
    console.error("   ❌ Erreur réseau :", err.message)
  }

  mock.closeAllConnections()
  mock.close()
}

async function testApiTimeout() {
  console.log("\n🐌 SCÉNARIO 2 : API externe timeout (myGo simulé)\n")
  const mock = await startMockTimeout()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`http://localhost:${MOCK_PORT + 1}/api/hotels/search?q=tunis`, {
      signal: controller.signal,
    })
    console.log(`   Status : ${res.status}`)
  } catch (err) {
    console.log(`   ❌ Timeout déclenché après 3s : ${err.name}`)
    console.log(`   ✅ Votre app doit servir le fixture JSON (fallback).`)
  } finally {
    clearTimeout(timeout)
    mock.closeAllConnections()
    mock.close()
  }
}

async function testDbOutage() {
  console.log("\n💥 SCÉNARIO 3 : Base de données indisponible\n")
  console.log(`   Action : lancer une requête avec DATABASE_URL invalide.`)
  console.log(`   Vérifiez manuellement que :`)
  console.log(`     - /admin affiche "Mode dégradé"`)
  console.log(`     - /api/* retourne 503 { error: "db_unavailable" }`)
  console.log(`     - Les mutations sont désactivées côté client`)

  // On ne peut pas tuer la DB de l'intérieur du script,
  // donc on guide l'utilisateur.
  console.log(`\n   Commande manuelle à exécuter dans un autre terminal :`)
  console.log(`     export DATABASE_URL="postgresql://fake:5432/db"`)
  console.log(`     curl http://localhost:${APP_PORT}/admin`)
  console.log(`     curl http://localhost:${APP_PORT}/api/hotels/search?q=tunis`)
}

/* ─── main ─── */

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗")
  console.log("║     SIMULATION DE PANNE — Error Boundaries & Fallbacks    ║")
  console.log("╚════════════════════════════════════════════════════════════╝")

  if (SCENARIO === "all" || SCENARIO === "webhook") await testWebhookFailure()
  if (SCENARIO === "all" || SCENARIO === "timeout") await testApiTimeout()
  if (SCENARIO === "all" || SCENARIO === "db") await testDbOutage()

  console.log("\n✅ Simulation terminée. Vérifiez vos logs Sentry et vos alerts.\n")
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
