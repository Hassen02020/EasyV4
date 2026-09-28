/**
 * Preload hook for Node's native test runner.
 * Stubs `server-only` so tests that import server-side modules
 * don't throw — Next.js handles this at build time, but the test
 * runner runs outside that context.
 */
import { register } from "node:module"
import { pathToFileURL } from "node:url"

// Register a no-op resolve hook for "server-only"
const data = { exports: {} }

register(
  "data:text/javascript,export async function resolve(spec, ctx, next) { if (spec === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,' }; return next(spec, ctx); }",
  pathToFileURL("./"),
  { data },
)
