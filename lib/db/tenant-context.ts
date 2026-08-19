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
        set_config('app.is_super_admin', ${ctx.isSuperAdmin ? "true" : "false"}, true)
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
  }
  const result = await withTenantContext(ctx, (tx) => fn(tx, ctx))
  return { ok: true, result }
}
