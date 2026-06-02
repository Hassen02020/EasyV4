import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Applique le middleware sur toutes les routes SAUF :
     *  - _next/static  (fichiers statiques Next.js)
     *  - _next/image   (optimisation images)
     *  - favicon.ico   (icône navigateur)
     *  - fichiers publics (png, jpg, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
}
