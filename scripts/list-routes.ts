#!/usr/bin/env tsx
/**
 * list-routes.ts
 *
 * Scanne le répertoire `app/` de Next.js App Router et extrait
 * toutes les URLs publiques, privées, API et webhooks.
 *
 * Usage :
 *   npx tsx scripts/list-routes.ts
 *   npx tsx scripts/list-routes.ts --json > routes.json
 */

import fs from "fs"
import path from "path"

const APP_DIR = path.resolve(process.cwd(), "app")

/* ─── helpers ─── */

function isRouteSegment(name: string): boolean {
  return (
    name.startsWith("(") && name.endsWith(")") // route groups (app)
  )
}

function toUrlSegment(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath))

  if (base === "page" || base === "route" || base === "loading") {
    return ""
  }

  if (base.startsWith("[[") && base.endsWith("]]")) {
    const inner = base.slice(2, -2) // [[...slug]] -> [...slug]
    return `/${inner}`
  }

  if (base.startsWith("[") && base.endsWith("]")) {
    return `/${base}`
  }

  return `/${base}`
}

function walk(dir: string, relative = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const routes: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue // privates (_lib, _components…)
    if (entry.name === "layout.tsx" || entry.name === "layout.ts") continue
    if (entry.name === "error.tsx" || entry.name === "error.ts") continue
    if (entry.name === "not-found.tsx" || entry.name === "not-found.ts") continue
    if (entry.name === "template.tsx" || entry.name === "template.ts") continue

    const fullPath = path.join(dir, entry.name)
    const relPath = path.join(relative, entry.name)

    if (entry.isDirectory()) {
      if (isRouteSegment(entry.name)) {
        // route group → n'apparaît pas dans l'URL
        routes.push(...walk(fullPath, relative))
      } else {
        routes.push(...walk(fullPath, relPath))
      }
      continue
    }

    const ext = path.extname(entry.name)
    if (![".tsx", ".ts", ".jsx", ".js"].includes(ext)) continue

    const base = path.basename(entry.name, ext)
    if (!["page", "route", "loading"].includes(base)) continue

    // Convert directory path to URL
    let url = "/" + relative.split(path.sep).map(toUrlSegment).join("")
    url = url.replace(/\/+/g, "/") // dedupe slashes
    if (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1)

    const kind: "page" | "api" | "loading" =
      base === "route" ? "api" : base === "loading" ? "loading" : "page"

    routes.push(JSON.stringify({ url, kind, file: `app/${relPath}` }))
  }

  return [...new Set(routes)] // dedupe
}

/* ─── main ─── */

function main() {
  if (!fs.existsSync(APP_DIR)) {
    console.error(`❌ Répertoire app/ introuvable : ${APP_DIR}`)
    process.exit(1)
  }

  const raw = walk(APP_DIR)
  const items = raw.map((s) => JSON.parse(s))

  // Tri : API d'abord, puis pages par profondeur
  items.sort((a, b) => {
    if (a.kind === "api" && b.kind !== "api") return -1
    if (b.kind === "api" && a.kind !== "api") return 1
    return a.url.localeCompare(b.url)
  })

  const jsonFlag = process.argv.includes("--json")

  if (jsonFlag) {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  const table = items.map((it) => ({
    URL: it.url,
    Type: it.kind === "api" ? "API" : it.kind === "loading" ? "Skeleton" : "Page",
    Fichier: it.file,
  }))

  console.log(`\n📦 Next.js App Router — ${table.length} routes détectées\n`)
  console.table(table)

  // Résumé par catégorie
  const pages = items.filter((i) => i.kind === "page").length
  const apis = items.filter((i) => i.kind === "api").length
  const skeletons = items.filter((i) => i.kind === "loading").length

  console.log(`\nRésumé : ${pages} pages · ${apis} API routes · ${skeletons} skeletons\n`)
}

main()
