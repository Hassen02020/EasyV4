/**
 * Seed d'infrastructure de base pour l'environnement de test local.
 *
 * Recrée, de façon idempotente, l'état minimal nécessaire pour que
 * l'application (dashboards admin/pro + tous les tunnels de réservation
 * B2C/B2B) fonctionne de bout en bout après une remise à zéro de la base :
 *
 *  - Agence OTA maîtresse `00000000-0000-0000-0000-000000000001` (Easy2Book)
 *    — c'est l'agence de vente directe B2C par défaut
 *    (`lib/agencies/default-agency.ts::getDefaultAgencyId`, qui prend la
 *    1ère agence `agencyType='ota'` sans `domain`).
 *  - Une 2ème agence B2B partenaire `00000000-0000-0000-0000-000000000002`
 *    ("Sahara Voyages") pour tester l'isolation tenant.
 *  - Les 2 users de test mappés sur les ids GoTrue mock fixes :
 *      11111111-... -> super_admin, rattaché à l'agence OTA
 *      66666666-... -> partner_owner, rattaché à Sahara Voyages (PAS
 *        l'agence maîtresse, pour que l'isolation cross-agence soit
 *        réellement testable)
 *    (client.test / 33333333-... n'a PAS besoin de ligne `users` — ce n'est
 *    pas un staff. `customers.authUserId` est renseigné dynamiquement par
 *    `lib/booking/customer-identity.ts::resolveLinkedAuthUserId` au moment
 *    d'une réservation, pas pré-créé ici.)
 *  - `pricing_margins` (hotel/flight/transfer) pour Sahara Voyages —
 *    `getMarginsForAgency` (lib/pro/server-context.ts) et `applyMargin`
 *    (lib/pro/pricing.ts) retombent sur `DEFAULT_MARGINS` si la table est
 *    vide, donc ce n'est pas bloquant, mais on seed pour tester le vrai
 *    chemin DB plutôt que le fallback.
 *  - 1 catalogue minimal réservable en B2C ET B2B (`channels: ['b2c','b2b']`,
 *    `status: 'published'`/`'open'`) pour chacun des 3 modules catalogue :
 *      Omra (omra_packages + omra_allotments)
 *      Voyages organisés (catalog_packages + catalog_package_departures)
 *      Activités (catalog_activities + catalog_activity_sessions)
 *    Dates de départ dans le futur proche (~30-45j après 2026-09-11) pour
 *    passer toute validation de fenêtre de réservation.
 *
 * Sécurité RLS (drizzle/manual/0001_rls_policies.sql +
 * 0012_rls_session_context.sql) : toutes les tables métier sont
 * `FORCE ROW LEVEL SECURITY`, et `DATABASE_URL` pointe sur `app_runtime`
 * (non-superuser, non-BYPASSRLS) — donc CE script doit lui-même poser un
 * contexte RLS valide pour écrire, exactement comme le fait déjà le code
 * applicatif via `withSystemContext()` (lib/db/tenant-context.ts), qui pose
 * `app.is_super_admin = true` dans une transaction locale. On ne contourne
 * PAS RLS en changeant de rôle Postgres — on emprunte le même mécanisme que
 * l'app utilise pour ses propres tâches système (cron, webhooks).
 *
 * Usage : `pnpm tsx scripts/seed-base-infra.ts`
 * Idempotent : tous les inserts utilisent des ids fixes + onConflictDoNothing.
 */

import "dotenv/config"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  users,
  pricingMargins,
  omraPackages,
  omraAllotments,
  catalogPackages,
  catalogPackageDepartures,
  catalogActivities,
  catalogActivitySessions,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Fixed ids                                                                  */
/* -------------------------------------------------------------------------- */

const OTA_AGENCY_ID = "00000000-0000-0000-0000-000000000001"
const PARTNER_AGENCY_ID = "00000000-0000-0000-0000-000000000002"

const ADMIN_USER_ID = "11111111-1111-1111-1111-111111111111"
const PRO_USER_ID = "66666666-6666-6666-6666-666666666666"
// client.test@easy2book.local (33333333-...) : voir note ci-dessus, pas de
// ligne `users` — B2C n'utilise pas cette table.

const OMRA_PACKAGE_ID = "10000000-0000-0000-0000-000000000001"
const OMRA_ALLOTMENT_ID = "10000000-0000-0000-0000-000000000002"

const CATALOG_PACKAGE_ID = "20000000-0000-0000-0000-000000000001"
const CATALOG_PACKAGE_DEPARTURE_ID = "20000000-0000-0000-0000-000000000002"

const CATALOG_ACTIVITY_ID = "30000000-0000-0000-0000-000000000001"
const CATALOG_ACTIVITY_SESSION_ID = "30000000-0000-0000-0000-000000000002"

/** Aujourd'hui = 2026-09-11 (contexte mission). Départs dans le futur proche
 * pour ne jamais être rejetés par une validation de fenêtre de résa. */
function futureDate(daysFromNow: number): string {
  const d = new Date("2026-09-11T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }
  console.log(
    "[seed-base] DATABASE_URL =",
    process.env.DATABASE_URL.replace(/:[^:@]+@/, ":<REDACTED>@"),
  )

  await withSystemContext(async (tx) => {
    console.log("[seed-base] 1/6 agencies...")
    await tx
      .insert(agencies)
      .values([
        {
          id: OTA_AGENCY_ID,
          slug: "easy2book",
          name: "Easy2Book",
          brandName: "Easy2Book",
          contactEmail: "contact@easy2book.local",
          agencyType: "ota",
          defaultLanguage: "fr",
          defaultCurrency: "TND",
          status: "active",
          domain: null,
        },
        {
          id: PARTNER_AGENCY_ID,
          slug: "sahara-voyages",
          name: "Sahara Voyages",
          brandName: "Sahara Voyages",
          contactEmail: "contact@sahara-voyages.local",
          agencyType: "partner",
          defaultLanguage: "fr",
          defaultCurrency: "TND",
          status: "active",
          domain: null,
        },
      ])
      .onConflictDoNothing({ target: agencies.id })

    console.log("[seed-base] 2/6 users (staff/role mapping)...")
    await tx
      .insert(users)
      .values([
        {
          id: ADMIN_USER_ID,
          agencyId: OTA_AGENCY_ID,
          email: "admin.test@easy2book.local",
          name: "Admin Test",
          role: "super_admin",
          status: "active",
        },
        {
          id: PRO_USER_ID,
          agencyId: PARTNER_AGENCY_ID,
          email: "pro.test@easy2book.local",
          name: "Pro Test (Sahara Voyages)",
          role: "partner_owner",
          status: "active",
        },
      ])
      .onConflictDoNothing({ target: users.id })

    console.log("[seed-base] 3/6 pricing_margins (Sahara Voyages)...")
    await tx
      .insert(pricingMargins)
      .values([
        {
          agencyId: PARTNER_AGENCY_ID,
          module: "hotel",
          marginType: "percent",
          marginValue: "12.00",
          isActive: true,
          notes: "Seed de test — marge hôtel Sahara Voyages",
        },
        {
          agencyId: PARTNER_AGENCY_ID,
          module: "flight",
          marginType: "fixed",
          marginValue: "30.00",
          isActive: true,
          notes: "Seed de test — marge vol Sahara Voyages",
        },
        {
          agencyId: PARTNER_AGENCY_ID,
          module: "transfer",
          marginType: "fixed",
          marginValue: "15.00",
          isActive: true,
          notes: "Seed de test — marge transfert Sahara Voyages",
        },
      ])
      .onConflictDoNothing({
        target: [pricingMargins.agencyId, pricingMargins.module],
      })

    console.log("[seed-base] 4/6 Omra package + allotment (OTA)...")
    await tx
      .insert(omraPackages)
      .values({
        id: OMRA_PACKAGE_ID,
        agencyId: OTA_AGENCY_ID,
        type: "omra",
        name: "Omra Famille Standard 12J",
        description: "Séjour Omra 12 jours, La Mecque / Médine, hôtels 4 étoiles, vols inclus.",
        durationDays: 12,
        validFrom: futureDate(0),
        validUntil: futureDate(365),
        basePrice: "4500.000",
        includesVisa: true,
        includesFlights: true,
        includesHotels: true,
        includesTransfers: true,
        includesZiarat: true,
        includesGuide: false,
        maxPilgrims: 45,
        minPilgrims: 1,
        status: "published",
        channels: ["b2c", "b2b"],
      })
      .onConflictDoNothing({ target: omraPackages.id })

    await tx
      .insert(omraAllotments)
      .values({
        id: OMRA_ALLOTMENT_ID,
        packageId: OMRA_PACKAGE_ID,
        departureDate: futureDate(45),
        totalCapacity: 30,
        reservedCount: 0,
        confirmedCount: 0,
        blockedCount: 0,
        availableCount: 30,
        bookingDeadline: futureDate(35),
        status: "active",
      })
      .onConflictDoNothing({ target: omraAllotments.id })

    console.log("[seed-base] 5/6 Package (Voyage organisé) + departure (OTA)...")
    await tx
      .insert(catalogPackages)
      .values({
        id: CATALOG_PACKAGE_ID,
        agencyId: OTA_AGENCY_ID,
        code: "PKG-DJERBA-7J",
        title: "Séjour Djerba 7 jours / 6 nuits",
        slug: "sejour-djerba-7-jours",
        shortDescription: "Séjour tout compris à Djerba, vols + hôtel 4 étoiles.",
        longDescription: "Séjour balnéaire 7 jours à Djerba : vols, transferts, hôtel 4 étoiles all inclusive.",
        departureLocations: ["Tunis"],
        transportMode: "flight",
        durationDays: 7,
        durationNights: 6,
        inclusions: ["Vols", "Transferts", "Hôtel 4*", "All Inclusive"],
        exclusions: ["Assurance annulation", "Dépenses personnelles"],
        status: "published",
        channels: ["b2c", "b2b"],
      })
      .onConflictDoNothing({ target: catalogPackages.id })

    await tx
      .insert(catalogPackageDepartures)
      .values({
        id: CATALOG_PACKAGE_DEPARTURE_ID,
        agencyId: OTA_AGENCY_ID,
        packageId: CATALOG_PACKAGE_ID,
        departureDate: futureDate(30),
        returnDate: futureDate(36),
        adultPriceTnd: "1450.00",
        childPriceTnd: "950.00",
        depositPercent: 30,
        totalSeats: 40,
        bookedSeats: 0,
        status: "open",
      })
      .onConflictDoNothing({ target: catalogPackageDepartures.id })

    console.log("[seed-base] 6/6 Activity + session (OTA)...")
    await tx
      .insert(catalogActivities)
      .values({
        id: CATALOG_ACTIVITY_ID,
        agencyId: OTA_AGENCY_ID,
        code: "ACT-DJERBA-JEEPSAFARI",
        title: "Jeep Safari Djerba",
        slug: "jeep-safari-djerba",
        shortDescription: "Excursion Jeep Safari sur l'île de Djerba, journée complète.",
        longDescription: "Excursion Jeep Safari d'une journée : désert, oasis, villages berbères, déjeuner inclus.",
        location: "Djerba",
        durationMinutes: 480,
        inclusions: ["Transport 4x4", "Déjeuner", "Guide francophone"],
        exclusions: ["Boissons", "Pourboires"],
        status: "published",
        channels: ["b2c", "b2b"],
      })
      .onConflictDoNothing({ target: catalogActivities.id })

    await tx
      .insert(catalogActivitySessions)
      .values({
        id: CATALOG_ACTIVITY_SESSION_ID,
        agencyId: OTA_AGENCY_ID,
        activityId: CATALOG_ACTIVITY_ID,
        sessionDate: futureDate(20),
        sessionStart: "09:00",
        sessionEnd: "17:00",
        capacity: 20,
        booked: 0,
        adultPriceTnd: "85.00",
        childPriceTnd: "45.00",
        status: "open",
      })
      .onConflictDoNothing({ target: catalogActivitySessions.id })
  })

  console.log("[seed-base] ✅ done. Verifying counts...")
  const db = getDb()
  const counts = await withSystemContext(async (tx) => {
    const [a] = await tx.select({ n: sql<number>`count(*)::int` }).from(agencies)
    const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(users)
    const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(pricingMargins)
    const [op] = await tx.select({ n: sql<number>`count(*)::int` }).from(omraPackages)
    const [oa] = await tx.select({ n: sql<number>`count(*)::int` }).from(omraAllotments)
    const [cp] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogPackages)
    const [cpd] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogPackageDepartures)
    const [ca] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogActivities)
    const [cas] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogActivitySessions)
    return { a, u, m, op, oa, cp, cpd, ca, cas }
  })
  console.log("  agencies                  :", counts.a?.n)
  console.log("  users                     :", counts.u?.n)
  console.log("  pricing_margins           :", counts.m?.n)
  console.log("  omra_packages             :", counts.op?.n)
  console.log("  omra_allotments           :", counts.oa?.n)
  console.log("  catalog_packages          :", counts.cp?.n)
  console.log("  catalog_package_departures:", counts.cpd?.n)
  console.log("  catalog_activities        :", counts.ca?.n)
  console.log("  catalog_activity_sessions :", counts.cas?.n)
  void db
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-base] ❌", err)
    process.exit(1)
  })
