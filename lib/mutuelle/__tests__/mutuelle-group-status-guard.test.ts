/**
 * CAS-D-FIX-01 — Garde statut du groupe Mutuelle dans reviewMutuelleRequest.
 *
 * Vérifie que :
 *  T-D7b : groupe suspendu → { ok: false } AVANT toute écriture métier ;
 *  T-D7c : groupe introuvable → { ok: false } AVANT toute écriture ;
 *  T-D7d : décision "rejected", groupe suspendu → { ok: false } (garde inconditionnelle) ;
 *  T-D7a : groupe actif + approved → approbation + réservation normales ;
 *  T-D7e : groupe actif + rejected → rejet normal (UPDATE + INSERT), sans booking.
 *
 * 100 % statiques — TX Drizzle mockée en mémoire, aucune DB, aucun réseau.
 * Toutes les dépendances à effets de bord (revalidatePath, sendEvent,
 * generateInvoiceForReservation, createMutuelleBookingInTx) sont mockées.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

/* ------------------------------------------------------------------ */
/* Mocks — hoistés par vitest avant chaque import                      */
/* ------------------------------------------------------------------ */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}))

vi.mock("@/lib/auth/profile", () => ({
  getCurrentAdminProfile: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/finance/invoice-actions", () => ({
  generateInvoiceForReservation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/inngest/client", () => ({
  sendEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../booking-actions", () => ({
  createMutuelleBookingInTx: vi.fn(),
}))

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantContext: vi.fn(),
}))

/* ------------------------------------------------------------------ */
/* Imports après mocks                                                 */
/* ------------------------------------------------------------------ */

import { reviewMutuelleRequest } from "../requests-actions"
import { withTenantContext } from "@/lib/db/tenant-context"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { createMutuelleBookingInTx } from "../booking-actions"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { sendEvent } from "@/lib/inngest/client"

const mockWithTenant = vi.mocked(withTenantContext)
const mockSupabase = vi.mocked(createServerSupabase)
const mockProfile = vi.mocked(getCurrentAdminProfile)
const mockBooking = vi.mocked(createMutuelleBookingInTx)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DIRECTOR_ID = "director-user-id"
const GROUP_ID = "grp-id"
const AGENCY_ID = "agency-id"
const REQ_ID = "00000000-0000-0000-0000-000000000001"

function mockLockedRequest() {
  return {
    id: REQ_ID,
    groupId: GROUP_ID,
    memberUserId: "member-user-id",
    module: "vol",
    description: "Voyage test",
    travelStartDate: "2026-12-01",
    travelEndDate: "2026-12-10",
    paxCount: 2,
    status: "pending" as const,
  }
}

/**
 * Construit une TX mock à appel séquentiel.
 *
 * - 1er SELECT … FOR UPDATE → mutuelleRequests (demande "pending")
 * - 2e  SELECT … FOR UPDATE → mutuelleGroups   (groupStatus | null si introuvable)
 * - SELECT … LIMIT 1        → users (membre)
 * - UPDATE / INSERT          → capturés dans `writes`
 */
function buildMockTx(config: {
  groupStatus: string | null // null = groupe introuvable
  memberFound?: boolean
}) {
  const writes: string[] = []
  let selectForUpdateCalls = 0

  const mockTx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: vi.fn().mockImplementation(() => {
            selectForUpdateCalls++
            if (selectForUpdateCalls === 1) {
              return Promise.resolve([mockLockedRequest()])
            }
            // 2e appel → mutuelleGroups
            if (config.groupStatus === null) return Promise.resolve([])
            return Promise.resolve([
              {
                status: config.groupStatus,
                executionAgencyId: "exec-agency-id",
                markupPercent: "10.00",
              },
            ])
          }),
          limit: vi.fn().mockImplementation(() => {
            if (config.memberFound === false) return Promise.resolve([])
            return Promise.resolve([
              { email: "member@test.com", name: "Test Member" },
            ])
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          writes.push("update:mutuelleRequests")
          return Promise.resolve()
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(() => {
        writes.push("insert:auditEvents")
        return Promise.resolve()
      }),
    }),
  }

  return { mockTx, writes }
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks()

  mockSupabase.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: DIRECTOR_ID } },
      }),
    },
  } as never)

  mockProfile.mockResolvedValue({
    role: "mutuelle_director",
    mutuelleGroupId: GROUP_ID,
    agencyId: AGENCY_ID,
  } as never)
})

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("CAS-D-FIX-01 — garde statut groupe avant toute écriture", () => {
  it("T-D7b : groupe suspendu + approved → { ok: false } sans aucune écriture", async () => {
    const { mockTx, writes } = buildMockTx({ groupStatus: "suspended" })

    mockWithTenant.mockImplementationOnce(async (_, cb) => cb(mockTx as never))

    const result = await reviewMutuelleRequest({
      requestId: REQ_ID,
      decision: "approved",
      basePriceTnd: 500,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/suspended/i)
    expect(writes).toHaveLength(0)
  })

  it("T-D7c : groupe introuvable + approved → { ok: false } sans aucune écriture", async () => {
    const { mockTx, writes } = buildMockTx({ groupStatus: null })

    mockWithTenant.mockImplementationOnce(async (_, cb) => cb(mockTx as never))

    const result = await reviewMutuelleRequest({
      requestId: REQ_ID,
      decision: "approved",
      basePriceTnd: 500,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(
      /introuvable/i,
    )
    expect(writes).toHaveLength(0)
  })

  it("T-D7d : groupe suspendu + rejected → { ok: false } (garde inconditionnelle)", async () => {
    const { mockTx, writes } = buildMockTx({ groupStatus: "suspended" })

    mockWithTenant.mockImplementationOnce(async (_, cb) => cb(mockTx as never))

    const result = await reviewMutuelleRequest({
      requestId: REQ_ID,
      decision: "rejected",
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/suspended/i)
    // La garde bloque aussi le rejet : aucun UPDATE ni INSERT
    expect(writes).toHaveLength(0)
  })

  it("T-D7a : groupe actif + approved + basePriceTnd → approbation + booking créé", async () => {
    mockBooking.mockResolvedValue({
      reservationId: "res-123",
      publicRef: "M-2026-001",
      totalTnd: 550,
    } as never)

    const { mockTx, writes } = buildMockTx({ groupStatus: "active" })

    mockWithTenant.mockImplementationOnce(async (_, cb) => cb(mockTx as never))

    const result = await reviewMutuelleRequest({
      requestId: REQ_ID,
      decision: "approved",
      basePriceTnd: 500,
    })

    expect(result.ok).toBe(true)
    expect((result as { ok: true; reservationId?: string }).reservationId).toBe(
      "res-123",
    )
    // UPDATE + INSERT ont bien eu lieu
    expect(writes).toContain("update:mutuelleRequests")
    expect(writes).toContain("insert:auditEvents")
    // booking appelé avec les données du groupe verrouillé
    expect(mockBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        executionAgencyId: "exec-agency-id",
        markupPercent: 10, // Number("10.00")
        basePriceTnd: 500,
      }),
    )
    // sendEvent et generateInvoice planifiés
    expect(sendEvent).toHaveBeenCalled()
    expect(generateInvoiceForReservation).toHaveBeenCalled()
  })

  it("T-D7e : groupe actif + rejected → rejet normal (UPDATE + INSERT), sans booking", async () => {
    const { mockTx, writes } = buildMockTx({ groupStatus: "active" })

    mockWithTenant.mockImplementationOnce(async (_, cb) => cb(mockTx as never))

    const result = await reviewMutuelleRequest({
      requestId: REQ_ID,
      decision: "rejected",
      directorNote: "Dossier incomplet",
    })

    expect(result.ok).toBe(true)
    expect(writes).toContain("update:mutuelleRequests")
    expect(writes).toContain("insert:auditEvents")
    // Aucune réservation créée pour un rejet
    expect(mockBooking).not.toHaveBeenCalled()
  })
})
