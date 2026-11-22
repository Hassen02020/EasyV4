/**
 * Processus enfant du test multi-instances : simule UNE instance serveur
 * distincte (état mémoire propre, donc aucune coalescence en mémoire entre
 * enfants). Lit sa configuration dans ATTEMPT_CHILD (JSON) et imprime le
 * résultat JSON sur stdout.
 */
import { mock } from "node:test"

async function main() {
  const cfg = JSON.parse(process.env.ATTEMPT_CHILD ?? "{}") as {
    agencyId: string
    input: Record<string, unknown>
  }
  mock.module("@/lib/agencies/default-agency", {
    namedExports: { getDefaultAgencyId: async () => cfg.agencyId },
  })
  const { createGuestTransferBooking } =
    await import("../../guest-booking-actions")
  const res = await createGuestTransferBooking(cfg.input as never)
  process.stdout.write("RESULT:" + JSON.stringify(res) + "\n")
  process.exit(0)
}
main().catch((e) => {
  process.stdout.write("RESULT:" + JSON.stringify({ crash: String(e) }) + "\n")
  process.exit(1)
})
