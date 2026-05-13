import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico / icons / images
     * - public assets (any path with a file extension)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|icon-.*\\.png|apple-icon\\.png|placeholder.*\\.(?:png|jpg|svg)).*)",
  ],
}
