#!/usr/bin/env node
/**
 * stress-test.mjs
 *
 * Simule un pic de trafic sur le portail B2B (route /pro/login ou /login)
 * avec 500 connexions simultanées pendant 30 secondes.
 *
 * Prérequis :
 *   npm install --save-dev autocannon
 *   L'app doit tourner en local (npm run dev) OU en mode production simulé
 *
 * Usage :
 *   node scripts/stress-test.mjs
 *   node scripts/stress-test.mjs --target http://localhost:3000/pro/login --duration 60
 */

import autocannon from "autocannon"

const args = process.argv.slice(2)
const targetArg = args.find((_, i) => args[i - 1] === "--target")
const durationArg = args.find((_, i) => args[i - 1] === "--duration")

const TARGET = targetArg ?? process.env.STRESS_TARGET ?? "http://localhost:3000/pro/login"
const DURATION = Number(durationArg ?? process.env.STRESS_DURATION ?? 30)
const CONNECTIONS = Number(process.env.STRESS_CONNECTIONS ?? 500)

console.log(`\n🚀 Stress Test — ${CONNECTIONS} connexions · ${DURATION}s`)
console.log(`🎯 Cible : ${TARGET}\n`)

const result = await autocannon({
  url: TARGET,
  connections: CONNECTIONS,
  duration: DURATION,
  pipelining: 1,
  timeout: 10,
  headers: {
    "user-agent": "EasyV4-StressBot/1.0",
  },
  // Simule un POST de login (optionnel — décommenter si vous voulez tester le login réel)
  // method: "POST",
  // body: JSON.stringify({ email: "test@example.com", password: "password123" }),
  // headers: { "content-type": "application/json" },
})

console.log("\n📊 Résultats :")
console.log(`   Requêtes totales   : ${result.requests.total}`)
console.log(`   Requêtes/sec       : ${Math.round(result.requests.average)}`)
console.log(`   Latence moyenne    : ${Math.round(result.latency.average)} ms`)
console.log(`   Latence p99        : ${Math.round(result.latency.p99)} ms`)
console.log(`   Erreurs            : ${result.errors}`)
console.log(`   Timeouts           : ${result.timeouts}`)
console.log(`   1xx / 2xx / 3xx    : ${result['1xx']} / ${result['2xx']} / ${result['3xx']}`)
console.log(`   4xx / 5xx          : ${result['4xx']} / ${result['5xx']}`)

const ok = result.errors === 0 && result['5xx'] === 0 && result.latency.p99 < 5000
console.log(ok ? "\n✅ Stress test PASSED" : "\n❌ Stress test FAILED (erreurs ou latence trop élevée)")
process.exit(ok ? 0 : 1)
