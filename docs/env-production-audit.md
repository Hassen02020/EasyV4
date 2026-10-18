# ENV-PRODUCTION-01 — Audit variables d'environnement production

> Date : 2026-10-18 | Projet Vercel : `easy2book-new` | Branche : `claude/env-production-01`
>
> **Accès Vercel MCP** : lecture/écriture des env vars bloquée (403, scope `easy2book`).
> Direction doit agir directement dans le dashboard :
> **Vercel → easy2book-new → Settings → Environment Variables**

---

## Légende

| Symbole | Signification |
|---|---|
| 🔴 CRITIQUE | App cassée ou fonctionnalité majeure silencieusement désactivée |
| 🟠 IMPORTANT | Feature dégradée, notification/email muet, paiement non routé |
| 🟡 SÉCURITÉ | Valeur par défaut de dev encore en prod — rotation nécessaire |
| 🟢 OPTIONNEL | Absent = stub honnête, aucun faux succès |

---

## Groupe 1 — Infrastructure Supabase

> Probablement déjà renseigné — à confirmer.

| Variable | Criticité | Où obtenir | Note |
|---|---|---|---|
| `DATABASE_URL` | 🔴 CRITIQUE | Supabase → projet → Connect → Pooler URL (port 6543) | Doit pointer sur le pooler, pas sur le direct |
| `DATABASE_DIRECT_URL` | 🔴 CRITIQUE | Supabase → Connect → Direct URL (port 5432) | Pour migrations drizzle-kit uniquement |
| `NEXT_PUBLIC_SUPABASE_URL` | 🔴 CRITIQUE | Supabase → Settings → API | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🔴 CRITIQUE | Supabase → Settings → API | clé `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 CRITIQUE | Supabase → Settings → API | clé `service_role` — jamais exposée côté client |

---

## Groupe 2 — Secrets de signature (sécurité)

> Ces variables ont des valeurs par défaut dans `.env.example` — elles doivent être **remplacées par des valeurs aléatoires uniques en production**.

| Variable | Criticité | Valeur par défaut (dev) | Comment générer |
|---|---|---|---|
| `PRICE_TOKEN_SECRET` | 🟡 SÉCURITÉ | `price-token-dev-secret-not-for-prod` | `openssl rand -hex 32` |
| `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY` | 🟡 SÉCURITÉ | `changeme-use-openssl-rand-hex-32` | `openssl rand -hex 32` |
| `CRON_SECRET` | 🟡 SÉCURITÉ | `changeme-use-random-64-chars` | `openssl rand -hex 32` |
| `HEALTH_SECRET` | 🟡 SÉCURITÉ | `changeme-use-random-64-chars` | `openssl rand -hex 32` |
| `VIRTUAL_MYGO_TOKEN_SECRET` | 🟡 SÉCURITÉ (faible) | `virtual-mygo-dev-secret-not-for-prod` | `openssl rand -hex 32` |
| `VIRTUAL_FLIGHTS_TOKEN_SECRET` | 🟡 SÉCURITÉ (faible) | `virtual-flights-dev-secret-not-for-prod` | `openssl rand -hex 32` |

---

## Groupe 3 — Inngest (background jobs)

> **Sans ces clés, tous les workflows asynchrones sont silencieusement désactivés** :
> confirmations de réservation, emails clients, notifications WhatsApp, settlements financiers.

| Variable | Criticité | Où obtenir |
|---|---|---|
| `INNGEST_SIGNING_KEY` | 🔴 CRITIQUE | https://app.inngest.com → Settings → Signing Key |
| `INNGEST_EVENT_KEY` | 🔴 CRITIQUE | https://app.inngest.com → Manage → Event Keys |

---

## Groupe 4 — Email transactionnel (Resend)

> **Sans `RESEND_API_KEY`, aucun email n'est envoyé** : confirmations, vouchers, notifications.

| Variable | Criticité | Où obtenir |
|---|---|---|
| `RESEND_API_KEY` | 🔴 CRITIQUE | https://resend.com → API Keys |
| `RESEND_INBOUND_SECRET` | 🟠 IMPORTANT | Resend → Inbound webhooks → secret de signature |

---

## Groupe 5 — Taux de change (règle CURRENCY-DIM-01)

> **Règle permanente** : sans cette clé, toute conversion de devise lève
> `ExchangeRateUnavailableError` (fail-closed) — les offres hôtels monde en devise
> étrangère ne s'affichent pas. Jamais de taux inventé ou par défaut.

| Variable | Criticité | Où obtenir |
|---|---|---|
| `EXCHANGE_RATE_API_KEY` | 🔴 CRITIQUE (hôtels monde) | https://www.exchangerate-api.com/ → Free key |
| `EXCHANGE_RATE_PROVIDER` | 🟢 info | Valeur par défaut : `exchangerate-api` |

---

## Groupe 6 — Paiement B2C (Paymee)

> Requis uniquement si `PAYMENT_PROVIDER=paymee`. Sans clé = `NotConfiguredPaymentProvider`
> (erreur honnête, jamais de faux succès).

| Variable | Criticité | Où obtenir / Note |
|---|---|---|
| `PAYMENT_PROVIDER` | 🔴 CRITIQUE | Poser `paymee` pour activer le PSP réel |
| `PAYMEE_API_KEY` | 🔴 CRITIQUE | Dashboard Paymee → API Keys |
| `PAYMEE_ENVIRONMENT` | 🟢 | `sandbox` pour test, `production` pour live |
| `PAYMEE_WEBHOOK_URL` | 🟠 IMPORTANT | URL publique que Paymee appelle → `https://easy2book-new.vercel.app/api/webhooks/paymee` |

---

## Groupe 7 — Fournisseur hôtels locaux (myGo)

| Variable | Criticité | Note |
|---|---|---|
| `MYGO_MODE` | 🔴 CRITIQUE | `live` en prod (sinon Virtual MyGo) |
| `MYGO_LOGIN` | 🔴 CRITIQUE | Credentials compte myGo |
| `MYGO_PASSWORD` | 🔴 CRITIQUE | Credentials compte myGo |
| `MYGO_API_BASE_URL` | 🟢 | Défaut : `https://admin.mygo.co/api/hotel` |

---

## Groupe 8 — Fournisseur hôtels monde (RateHawk)

| Variable | Criticité | Note |
|---|---|---|
| `RATEHAWK_KEY_ID` | 🔴 CRITIQUE (hôtels monde) | Dashboard RateHawk → API |
| `RATEHAWK_API_KEY` | 🔴 CRITIQUE (hôtels monde) | Dashboard RateHawk → API |
| `RATEHAWK_ENV` | 🟢 | `production` en prod (`sandbox` pour test) |
| `RATEHAWK_API_BASE_URL` | 🟢 | `https://api.worldota.net/api/b2b/v3` en production |

---

## Groupe 9 — Meta CRM (Messenger / Instagram / Lead Ads)

> Sans ces clés, les webhooks entrants Meta arrivent mais la signature n'est pas vérifiée
> (erreur 400 ou 401). Les fonctionnalités Lead Ads et CRM omnicanal restent muettes.

| Variable | Criticité | Où obtenir |
|---|---|---|
| `META_PAGE_ACCESS_TOKEN` | 🟠 IMPORTANT | Meta Business Manager → Page → Access Token |
| `META_APP_SECRET` | 🟠 IMPORTANT | Meta Developers → App → Settings → App Secret |
| `META_MESSENGER_VERIFY_TOKEN` | 🟠 IMPORTANT | Chaîne arbitraire — à poser dans Meta webhook config |
| `META_INSTAGRAM_VERIFY_TOKEN` | 🟠 IMPORTANT | Chaîne arbitraire — à poser dans Meta webhook config |
| `META_GRAPH_API_VERSION` | 🟢 | Défaut : `v21.0` |

---

## Groupe 10 — WhatsApp Business

| Variable | Criticité | Note |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | 🟠 IMPORTANT | Meta Business → WhatsApp → Access Token |
| `WHATSAPP_PHONE_NUMBER_ID` | 🟠 IMPORTANT | Meta Business → WhatsApp → Phone Number ID |
| `WHATSAPP_VERIFY_TOKEN` | 🟠 IMPORTANT | Chaîne arbitraire — à poser dans Meta webhook config |
| `WHATSAPP_APP_SECRET` | 🟠 IMPORTANT | Meta App Secret (vérification signature) |

---

## Groupe 11 — Optionnel / Futur

| Variable | État | Note |
|---|---|---|
| `DUFFEL_ACCESS_TOKEN` | 🟢 OPTIONNEL | Vols Duffel réels — sans clé = Virtual Flight Supplier |
| `SPS_MERCHANT_ID` + suite | 🟢 OPTIONNEL | SPS Monétique (non activé) |
| `STRIPE_SECRET_KEY` + suite | 🟢 OPTIONNEL | Stripe (non activé) |
| `UPSTASH_REDIS_REST_URL` | 🟢 OPTIONNEL | Rate limiting distribué — sans = in-memory |
| `SENTRY_DSN` | 🟢 OPTIONNEL | Observabilité — sans = captureError silencieux |
| `TWILIO_ACCOUNT_SID` + suite | 🟢 OPTIONNEL | SMS chauffeur — sans = stub |

---

## Récapitulatif priorités immédiates

> Agir dans cet ordre dans le dashboard Vercel :

```
1. Vérifier que DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY sont posés.
2. Poser INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY → débloquer tous les workflows.
3. Poser RESEND_API_KEY → débloquer emails.
4. Poser EXCHANGE_RATE_API_KEY → débloquer hôtels monde en devise étrangère.
5. Poser PAYMENT_PROVIDER=paymee + PAYMEE_API_KEY + PAYMEE_ENVIRONMENT=production → débloquer paiements B2C.
6. Remplacer PRICE_TOKEN_SECRET, SUPPLIER_CREDENTIALS_ENCRYPTION_KEY, CRON_SECRET par des valeurs aléatoires.
7. Poser META_* + WHATSAPP_* si CRM omnicanal requis.
```

---

## Blocage MCP

La lecture et l'écriture des env vars via le MCP Vercel retournent `403 forbidden` — scope `easy2book` non autorisé pour ce token. Direction doit agir directement :

**Vercel Dashboard → easy2book-new → Settings → Environment Variables → Add New**

Si Direction souhaite que Claude Code pose les valeurs via MCP, il faut reconnecter le compte Vercel avec le bon scope dans les paramètres de ce workspace Claude Code.
