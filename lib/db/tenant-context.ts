/**
 * Contexte tenant (agence) pour Row-Level Security PostgreSQL.
 *
 * Notre connexion Drizzle (`lib/db/client.ts`) est une connexion Postgres
 * DIRECTE (postgres-js + `DATABASE_URL`), pas un appel PostgREST — Postgres
 * n'a donc par défaut AUCUNE idée de "qui" exécute une requête. Les policies
 * RLS (`drizzle/manual/0001_rls_policies.sql` et suivants) filtrent sur
 * `agency_id = current_agency_id()`, où `current_agency_id()` lit le GUC de
 * session `app.current_agency_id`. Tant que rien ne positionne ce GUC, RLS
 * est soit inerte (rôle propriétaire/BYPASSRLS), soit fail-closed pour tout
 * le monde (rôle restreint + `FORCE ROW LEVEL SECURITY`, voir
 * `drizzle/manual/0012_rls_session_context.sql`).
 *
 * Toute Server Action qui touche des données appartenant à une agence doit
 * passer par `runInTenantContext()` (ou `withTenantContext()` si l'agence/le
 * rôle sont déjà connus) au lieu d'appeler `getDb()` directement.
 */

"use server"

import { sql } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "./client"
import { createServerSupabase } from "@/lib/supabase/server"

export interface TenantContext {
  /** Peut être `null` pour un super_admin plateforme sans agence rattachée. */
  agencyId: string | null
  userId: string
  isSuperAdmin: boolean
  /** Groupe Mutuelle de l'utilisateur (directeur/membre) — `null`/absent pour tout le reste. Jamais confondu avec agencyId : une Mutuelle n'est pas une agence. */
  mutuelleGroupId?: string | null
}

export type SessionContextResult =
  | ({ ok: true } & TenantContext)
  | { ok: false; error: string }

/**
 * Résout l'agence/rôle de l'utilisateur Supabase authentifié courant en
 * appelant `resolve_session_context()` (fonction SQL `SECURITY DEFINER` qui
 * contourne volontairement la RLS de `users` — seul moyen de sortir du
 * problème de la poule et de l'œuf : lire `users` nécessite déjà un contexte
 * RLS posé, qu'on ne connaît pas encore avant d'avoir lu `users`).
 *
 * Sûr uniquement parce que `user.id` provient ici d'un JWT Supabase vérifié
 * côté serveur (`supabase.auth.getUser()`) — ne jamais reproduire ce pattern
 * avec un id fourni par le client.
 */
export async function resolveSessionContext(): Promise<SessionContextResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, error: "Non authentifié" }
  }

  const db = getDb()
  const rows = (await db.execute(
    sql`select * from resolve_session_context(${user.id}::uuid)`,
  )) as Array<{
    agency_id: string | null
    role: string | null
    status: string | null
    mutuelle_group_id: string | null
  }>

  const row = rows[0]
  if (!row || row.status !== "active") {
    return { ok: false, error: "Profil utilisateur introuvable ou inactif" }
  }

  return {
    ok: true,
    agencyId: row.agency_id,
    userId: user.id,
    isSuperAdmin: row.role === "super_admin",
    mutuelleGroupId: row.mutuelle_group_id,
  }
}

/**
 * Exécute `fn` dans une transaction Postgres avec le contexte RLS posé via
 * `set_config(..., true)` — portée `LOCAL` (réinitialisée au COMMIT/ROLLBACK,
 * donc jamais de fuite de contexte entre requêtes sur une connexion réutilisée
 * par le pool postgres-js).
 */
export async function withTenantContext<T>(
  ctx: TenantContext,
  fn: (tx: DrizzleTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.current_agency_id', ${ctx.agencyId ?? ""}, true),
        set_config('app.current_user_id', ${ctx.userId}, true),
        set_config('app.is_super_admin', ${ctx.isSuperAdmin ? "true" : "false"}, true),
        set_config('app.current_mutuelle_group_id', ${ctx.mutuelleGroupId ?? ""}, true)
    `)
    return fn(tx)
  })
}

/**
 * Contexte pour les endpoints système de confiance qui n'ont — par
 * construction — aucune session Supabase à résoudre : cron jobs protégés par
 * `CRON_SECRET`, webhooks PSP vérifiés par signature HMAC. Ces appelants sont
 * déjà authentifiés par un secret partagé avant d'arriver ici ; on leur donne
 * le même accès cross-agence que `is_super_admin()` (cf. la policy
 * `psp_webhooks_admin` de `drizzle/manual/0001_rls_policies.sql`, qui
 * anticipait déjà ce besoin). Ne jamais utiliser ce helper pour une route
 * qui accepte une session utilisateur — uniquement pour un secret partagé
 * déjà vérifié par l'appelant.
 */
export async function withSystemContext<T>(
  fn: (tx: DrizzleTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.current_agency_id', '', true),
        set_config('app.is_super_admin', 'true', true)
    `)
    return fn(tx)
  })
}

/**
 * UUID nul, réservé comme valeur sentinelle pour `app.current_user_id` dans
 * `withPublicAgencyContext()` — jamais un vrai id de ligne `users`.
 */
const PUBLIC_CONTEXT_USER_ID_SENTINEL = "00000000-0000-0000-0000-000000000000"

/**
 * Contexte pour les lectures catalogue/tarification PUBLIQUES (aucune
 * session Supabase à résoudre, aucun appelant humain identifié) — jamais
 * `app.is_super_admin = true`. Différent de `withSystemContext()` : celui-ci
 * reste réservé aux appelants déjà authentifiés par un secret partagé (cron,
 * webhook signé) ; `withPublicAgencyContext()` est pour du trafic réellement
 * anonyme qui n'a besoin que d'un accès en lecture scopé à une agence (ou à
 * aucune, pour un catalogue plateforme non tenant-scoped comme
 * `destinations`/`hotel_suppliers`).
 *
 * `agencyId` peut être `null` pour ces tables plateforme : leurs policies
 * n'exigent qu'une "session réelle" au sens RLS, pas une agence précise (ex.
 * `destinations_select`/`hotel_suppliers_select`,
 * `0054_destinations.sql`/`0035_hotel_supplier_control_plane.sql`) — d'où le
 * GUC `app.current_user_id` posé à une valeur sentinelle non vide plutôt que
 * laissé vide : ces policies testent `current_setting(...) is not null and
 * <> ''`. Ce sentinel doit rester un UUID syntaxiquement valide (pas une
 * chaîne arbitraire) : `current_user_id()` (`0029_fix_users_manager_write_authuid.sql`)
 * le caste en `uuid` pour d'autres policies (`users`/`permission_grants`) —
 * une valeur non-UUID y lèverait une erreur si jamais évaluée sur une requête
 * qui joint une de ces tables, pas seulement 0 ligne.
 *
 * Ne JAMAIS utiliser pour résoudre une agence/réservation sans la connaître
 * à l'avance (recherche par domaine, par référence+email...) — ces cas
 * restent sur `withSystemContext()`, l'agence n'étant pas encore connue au
 * moment de la requête.
 */
export async function withPublicAgencyContext<T>(
  agencyId: string | null,
  fn: (tx: DrizzleTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.current_agency_id', ${agencyId ?? ""}, true),
        set_config('app.current_user_id', ${PUBLIC_CONTEXT_USER_ID_SENTINEL}, true),
        set_config('app.is_super_admin', 'false', true),
        set_config('app.current_mutuelle_group_id', '', true)
    `)
    return fn(tx)
  })
}

/**
 * Raccourci le plus courant : résout la session Supabase courante puis
 * exécute `fn` dans son contexte tenant. Renvoie `{ ok: false }` sans jamais
 * toucher aux données métier si l'utilisateur n'est pas authentifié ou que
 * son profil est introuvable/inactif.
 */
export async function runInTenantContext<T>(
  fn: (tx: DrizzleTransaction, ctx: TenantContext) => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const session = await resolveSessionContext()
  if (!session.ok) return session

  const ctx: TenantContext = {
    agencyId: session.agencyId,
    userId: session.userId,
    isSuperAdmin: session.isSuperAdmin,
    mutuelleGroupId: session.mutuelleGroupId,
  }
  const result = await withTenantContext(ctx, (tx) => fn(tx, ctx))
  return { ok: true, result }
}
