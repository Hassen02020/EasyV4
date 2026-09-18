/**
 * GET /api/media/[...key]
 *
 * Sert les fichiers du backend Storage local (`lib/media/storage.ts`,
 * `MEDIA_STORAGE_BACKEND=local` — LOCAL TEST uniquement, ce sandbox n'a pas
 * de projet Supabase Storage réel, voir en-tête de storage.ts). En
 * production (`MEDIA_STORAGE_BACKEND` absent ou "supabase"), cette route
 * n'est jamais utilisée : `getPublicUrl()` renvoie directement l'URL
 * publique Supabase Storage, sans passer par l'app.
 *
 * Médias produits = contenu commercial public (mission §33/§34, jamais de
 * document privé) : pas d'authentification ici, contrairement aux routes
 * voucher/invoice. Cache-Control public : les clés incluent un uuid par
 * upload, donc jamais réécrites en place (mission §11) — un cache long est
 * sûr.
 */

import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { LOCAL_MEDIA_ROOT } from "@/lib/media/storage"

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params

  // Rejette tout segment suspect avant toute résolution de chemin —
  // path.resolve() seul ne suffit pas à documenter l'intention ici.
  if (segments.some((s) => s === ".." || s === "" || s.includes("\0"))) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 })
  }

  const filePath = path.resolve(LOCAL_MEDIA_ROOT, ...segments)
  if (!filePath.startsWith(path.resolve(LOCAL_MEDIA_ROOT) + path.sep)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 })
  }

  let data: Buffer
  try {
    data = await fs.readFile(filePath)
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream"

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
