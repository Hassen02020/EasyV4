/**
 * Pagination Serveur - Helpers pour pagination côté serveur
 * 
 * Architecture:
 * - Cursor-based pagination (plus performant que offset pour grandes tables)
 * - Offset-based pagination (pour cas simples)
 * - Génération automatique des métadonnées de pagination
 * 
 * Usage:
 * ```ts
 * const { data, pagination, nextCursor } = await paginateQuery({
 *   query: db.select().from(reservations),
 *   cursor: searchParams.cursor,
 *   limit: 20
 * })
 * ```
 */

import { sql, type SQL } from "drizzle-orm"

// ============================================================================
// TYPES
// ============================================================================

export interface PaginationParams {
  /** Page actuelle (pour offset-based) */
  page?: number
  /** Nombre d'items par page */
  limit?: number
  /** Cursor pour cursor-based pagination */
  cursor?: string | null
  /** Ordre de tri */
  sort?: "asc" | "desc"
  /** Champ de tri */
  sortBy?: string
}

export interface PaginationResult<T> {
  /** Données paginées */
  data: T[]
  /** Métadonnées de pagination */
  meta: {
    /** Page actuelle */
    currentPage: number
    /** Nombre total de pages (si count disponible) */
    totalPages?: number
    /** Nombre total d'items (si count disponible) */
    totalCount?: number
    /** Items par page */
    perPage: number
    /** A-t-on une page suivante */
    hasNextPage: boolean
    /** A-t-on une page précédente */
    hasPrevPage: boolean
    /** Cursor pour la page suivante (cursor-based) */
    nextCursor?: string | null
    /** Cursor pour la page précédente (cursor-based) */
    prevCursor?: string | null
  }
}

export interface CursorPayload {
  /** Valeur du curseur encodée */
  cursor: string
  /** Direction du tri */
  direction: "next" | "prev"
}

// ============================================================================
// ENCODE/DECODE CURSOR
// ============================================================================

/**
 * Encode une valeur en cursor base64url
 */
export function encodeCursor(value: Record<string, unknown>): string {
  const json = JSON.stringify(value)
  return Buffer.from(json).toString("base64url")
}

/**
 * Décode un cursor base64url
 */
export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Crée un cursor à partir d'un timestamp et d'un ID
 */
export function createTimestampCursor(timestamp: Date, id: string): string {
  return encodeCursor({ ts: timestamp.toISOString(), id })
}

// ============================================================================
// PAGINATION OFFSET-BASED (simple)
// ============================================================================

interface OffsetPaginationOptions<T> {
  /** Query Drizzle de base */
  query: any
  /** Page demandée (1-based) */
  page?: number
  /** Items par page */
  limit?: number
  /** Fonction de count total (optionnel) */
  countQuery?: () => Promise<number>
  /** Ordre de tri par défaut */
  orderBy?: SQL | SQL[]
}

/**
 * Pagination offset-based classique
 * 
 * ✅ Avantages: Simple, navigation directe à une page
 * ❌ Inconvénients: Performance dégrade sur grandes tables (>100k rows)
 * 
 * Recommandé pour: Tables < 50k rows, ou quand besoin de navigation directe
 */
export async function paginateOffset<T>({
  query,
  page = 1,
  limit = 20,
  countQuery,
  orderBy,
}: OffsetPaginationOptions<T>): Promise<PaginationResult<T>> {
  const validPage = Math.max(1, page)
  const validLimit = Math.min(100, Math.max(1, limit)) // Max 100 items par page
  const offset = (validPage - 1) * validLimit

  // 1. Récupération des données
  let dataQuery = query.limit(validLimit).offset(offset)
  
  if (orderBy) {
    dataQuery = dataQuery.orderBy(orderBy)
  }

  const data = await dataQuery

  // 2. Count total (si fourni)
  let totalCount: number | undefined
  if (countQuery) {
    totalCount = await countQuery()
  }

  // 3. Calcul métadonnées
  const totalPages = totalCount ? Math.ceil(totalCount / validLimit) : undefined
  const hasNextPage = data.length === validLimit
  const hasPrevPage = validPage > 1

  return {
    data,
    meta: {
      currentPage: validPage,
      totalPages,
      totalCount,
      perPage: validLimit,
      hasNextPage,
      hasPrevPage,
    },
  }
}

// ============================================================================
// PAGINATION CURSOR-BASED (performant)
// ============================================================================

interface CursorPaginationOptions<T> {
  /** Query Drizzle de base */
  query: any
  /** Cursor actuel */
  cursor?: string | null
  /** Direction (next ou prev) */
  direction?: "next" | "prev"
  /** Items par page */
  limit?: number
  /** Colonne de tri (doit être unique ou combinée avec ID) */
  sortColumn: string
  /** Tableau pour extraire les valeurs */
  table: any
}

/**
 * Pagination cursor-based
 * 
 * ✅ Avantages: Performance constante, même sur millions de rows
 * ❌ Inconvénients: Pas de navigation directe à page N
 * 
 * Recommandé pour: Tables > 50k rows, logs, réservations
 */
export async function paginateCursor<T>({
  query,
  cursor,
  direction = "next",
  limit = 20,
  sortColumn,
  table,
}: CursorPaginationOptions<T>): Promise<PaginationResult<T>> {
  const validLimit = Math.min(100, Math.max(1, limit))

  let dataQuery = query

  // 1. Application du cursor si présent
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded && decoded.ts && decoded.id) {
      const cursorDate = new Date(decoded.ts as string)
      const cursorId = decoded.id as string

      if (direction === "next") {
        // On veut les éléments PLUS RÉCENTS que le cursor
        dataQuery = dataQuery.where(
          sql`(${table[sortColumn]}, ${table.id}) < (${cursorDate.toISOString()}, ${cursorId})`
        )
      } else {
        // On veut les éléments PLUS ANCIENS que le cursor (prev)
        dataQuery = dataQuery.where(
          sql`(${table[sortColumn]}, ${table.id}) > (${cursorDate.toISOString()}, ${cursorId})`
        )
      }
    }
  }

  // 2. Récupération (limit + 1 pour savoir si page suivante existe)
  const data = await dataQuery
    .limit(validLimit + 1)
    .orderBy(sql`${table[sortColumn]} DESC, ${table.id} DESC`)

  // 3. Détection page suivante
  const hasNextPage = data.length > validLimit
  const hasPrevPage = !!cursor

  // 4. Tronquer au limit réel
  const actualData = data.slice(0, validLimit) as T[]

  // 5. Génération cursors
  let nextCursor: string | null = null
  let prevCursor: string | null = null

  if (hasNextPage && actualData.length > 0) {
    const lastItem = actualData[actualData.length - 1] as any
    if (lastItem[sortColumn] && lastItem.id) {
      nextCursor = createTimestampCursor(
        new Date(lastItem[sortColumn]),
        lastItem.id
      )
    }
  }

  if (cursor) {
    prevCursor = cursor // Le cursor actuel devient prev
  }

  return {
    data: actualData,
    meta: {
      currentPage: 0, // Pas de notion de page en cursor-based
      perPage: validLimit,
      hasNextPage,
      hasPrevPage,
      nextCursor,
      prevCursor,
    },
  }
}

// ============================================================================
// HELPERS URL BUILDING
// ============================================================================

/**
 * Construit une URL de pagination à partir des paramètres
 */
export function buildPaginationUrl(
  baseUrl: string,
  params: {
    page?: number
    cursor?: string | null
    limit?: number
    sortBy?: string
    sort?: "asc" | "desc"
  }
): string {
  const url = new URL(baseUrl, "http://localhost") // Base fictive pour parsing
  const searchParams = url.searchParams

  if (params.page) searchParams.set("page", String(params.page))
  if (params.cursor) searchParams.set("cursor", params.cursor)
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params.sort) searchParams.set("sort", params.sort)

  return url.pathname + url.search
}

// ============================================================================
// PAGINATION COMPONENTS HELPERS
// ============================================================================

/**
 * Génère les liens de navigation pour pagination
 */
export function getPaginationLinks(
  currentParams: PaginationParams,
  meta: PaginationResult<unknown>["meta"],
  basePath: string
): {
  first: string
  prev?: string
  next?: string
  last?: string
} {
  const links: {
    first: string
    prev?: string
    next?: string
    last?: string
  } = {
    first: buildPaginationUrl(basePath, {
      ...currentParams,
      page: 1,
      cursor: null,
    }),
  }

  if (meta.hasPrevPage && currentParams.page && currentParams.page > 1) {
    links.prev = buildPaginationUrl(basePath, {
      ...currentParams,
      page: currentParams.page - 1,
    })
  }

  if (meta.hasNextPage) {
    if (meta.nextCursor) {
      // Cursor-based
      links.next = buildPaginationUrl(basePath, {
        ...currentParams,
        cursor: meta.nextCursor,
      })
    } else if (currentParams.page && meta.totalPages) {
      // Offset-based
      links.next = buildPaginationUrl(basePath, {
        ...currentParams,
        page: currentParams.page + 1,
      })
      links.last = buildPaginationUrl(basePath, {
        ...currentParams,
        page: meta.totalPages,
      })
    }
  }

  return links
}
