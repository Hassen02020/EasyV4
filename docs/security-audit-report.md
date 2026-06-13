# Audit Report - Sécurité
**Date** : 13 Juin 2026
**Projet** : Easy2Book V6

## 1. Middleware - PARTIELLEMENT SÉCURISÉ

### État Actuel
Le middleware existe et applique des headers de sécurité :
- `middleware.ts` - Headers de sécurité (X-Frame-Options, X-Content-Type-Options, etc.)
- Mise à jour de session Supabase
- Matcher sur toutes les routes sauf les assets statiques

### Problème
Le middleware ne vérifie pas les rôles pour les routes admin :
- Pas de vérification RBAC au niveau middleware
- Redirection uniquement basée sur l'authentification (pas l'autorisation)
- Les routes admin sont accessibles à tout utilisateur authentifié

### Impact
- Tout utilisateur authentifié peut potentiellement accéder au back-office
- Le layout admin fait la vérification mais c'est trop tard (defense-in-depth insuffisant)
- Risque d'élévation de privilèges

### Recommandation
Ajouter une vérification RBAC au niveau middleware :
```typescript
// middleware.ts
import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createClient } from "@/lib/supabase/server"

const ADMIN_ROUTES = /^\/admin(\/|$)/
const PRO_ROUTES = /^\/pro(\/|$)/

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  
  // Vérification RBAC pour routes admin
  if (ADMIN_ROUTES.test(request.nextUrl.pathname)) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    
    // Récupérer le rôle depuis la table users
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()
    
    const adminRoles = ["super_admin", "manager", "agent_resa", "agent_compta", "agent_excursions"]
    
    if (!profile || !adminRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/unauthorized", request.url))
    }
  }
  
  // Headers de sécurité
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  
  return response
}
```

## 2. Layout Admin - Vérification Rôle Correcte

### État Actuel
Le layout admin vérifie correctement le rôle :
- `app/admin/layout.tsx` - Vérification session Supabase
- Récupération du profil utilisateur étendu
- Redirection des partenaires B2B vers `/pro`
- Restriction aux rôles admin

### Points Positifs
- Defense-in-depth avec vérification au niveau layout
- Redirection appropriée des partenaires B2B
- Typage strict des rôles admin

### Amélioration Possible
Ajouter une vérification RBAC plus granulaire par section :
```typescript
// app/admin/finance/layout.tsx
export default async function FinanceLayout({ children }) {
  const profile = await getCurrentAdminProfile(user.id)
  
  // Seuls super_admin, manager, agent_compta peuvent accéder
  const allowedRoles = ["super_admin", "manager", "agent_compta"]
  
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin?error=unauthorized")
  }
  
  return <FinanceShell>{children}</FinanceShell>
}
```

## 3. API Routes - Pas de Vérification RBAC

### Problème
Les API routes n'ont pas de vérification RBAC :
- `app/api/*` - Pas de vérification de rôle
- Toute personne authentifiée peut appeler les API admin

### Impact
- Risque d'accès non autorisé aux données
- Possibilité de modification de données sensibles
- Élévation de privilèges

### Recommandation
Créer un helper de vérification RBAC pour les API routes :
```typescript
// lib/api/rbac-guard.ts
import { createServerSupabase } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function requireAdminRole(allowedRoles: string[] = ["super_admin", "manager"]) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()
  
  if (!profile || !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  
  return null // Pas d'erreur
}

// Utilisation
// app/api/admin/users/route.ts
export async function GET(request: Request) {
  const rbacError = await requireAdminRole(["super_admin", "manager"])
  if (rbacError) return rbacError
  
  // Suite de la logique...
}
```

## 4. Server Actions - Pas de Vérification RBAC

### Problème
Les Server Actions n'ont pas de vérification RBAC :
- `lib/admin/actions.ts` - Pas de vérification de rôle
- `lib/booking/actions.ts` - Pas de vérification de rôle
- `lib/wallet/actions.ts` - Pas de vérification de rôle

### Impact
- Risque d'exécution d'actions non autorisées
- Modification de données sensibles
- Débit wallet non autorisé

### Recommandation
Créer un helper de vérification RBAC pour les Server Actions :
```typescript
// lib/api/action-rbac.ts
import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function requireActionRole(allowedRoles: string[] = ["super_admin", "manager"]) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }
  
  const { data: profile } = await supabase
    .from("users")
    .select("role, agency_id")
    .eq("id", user.id)
    .single()
  
  if (!profile || !allowedRoles.includes(profile.role)) {
    throw new Error("Unauthorized")
  }
  
  return { user, profile }
}

// Utilisation
// lib/admin/actions.ts
export async function deleteAgency(agencyId: string) {
  const { profile } = await requireActionRole(["super_admin"])
  
  // Suite de la logique...
}
```

## 5. Pas de Rate Limiting sur les API Routes

### Problème
Les API routes n'ont pas de rate limiting :
- Possibilité d'abus (brute force, spam)
- Surcharge du serveur
- Coût infrastructure

### Impact
- Risque d'attaque DoS
- Surcharge API fournisseurs
- Coût accru

### Recommandation
Implémenter le rate limiting (déjà disponible dans `lib/rate-limit.ts`) :
```typescript
// app/api/admin/users/route.ts
import { rateLimit } from "@/lib/rate-limit"

export async function GET(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    limit: 100, // 100 requêtes par 15 min
    window: 15 * 60 * 1000,
  })
  
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    )
  }
  
  // Suite de la logique...
}
```

## 6. Pas de Validation des Inputs

### Problème
Les inputs des Server Actions ne sont pas validés :
- Pas de Zod validation
- Injection potentielle
- Données invalides en base

### Impact
- Données invalides en base
- Erreurs potentielles
- Risque de sécurité

### Recommandation
Ajouter Zod validation pour tous les inputs :
```typescript
// lib/admin/actions.ts
import { z } from "zod"

const deleteAgencySchema = z.object({
  agencyId: z.string().uuid(),
  reason: z.string().min(10).max(500),
})

export async function deleteAgency(input: unknown) {
  const validated = deleteAgencySchema.parse(input)
  
  // Suite de la logique...
}
```

## 7. Pas de Logging des Actions Admin

### Problème
Les actions admin ne sont pas loggées :
- Pas de traçabilité
- Difficulté d'audit
- Impossible de détecter les abus

### Impact
- Pas de traçabilité des actions
- Difficulté d'audit
- Risque d'abus non détecté

### Recommandation
Utiliser le logger existant (`lib/audit/logger.ts`) :
```typescript
// lib/admin/actions.ts
import { auditLogger } from "@/lib/audit/logger"

export async function deleteAgency(agencyId: string, reason: string) {
  const { profile } = await requireActionRole(["super_admin"])
  
  await auditLogger.log({
    agencyId: profile.agencyId,
    entityType: "agency",
    entityId: agencyId,
    action: "delete",
    userId: profile.id,
    details: { reason },
  })
  
  // Suite de la logique...
}
```

## Plan de Migration Prioritaire

### Étape 1 : Middleware RBAC (1 jour)
1. Ajouter vérification RBAC dans middleware.ts
2. Tests de sécurité
3. Déploiement

### Étape 2 : API Routes RBAC (2 jours)
1. Créer helper RBAC pour API routes
2. Ajouter vérification sur toutes les API routes admin
3. Tests

### Étape 3 : Server Actions RBAC (2 jours)
1. Créer helper RBAC pour Server Actions
2. Ajouter vérification sur toutes les Server Actions sensibles
3. Tests

### Étape 4 : Rate Limiting (1 jour)
1. Activer rate limiting sur toutes les API routes
2. Configurer les limites appropriées
3. Tests

### Étape 5 : Validation Inputs (2 jours)
1. Ajouter Zod validation sur tous les Server Actions
2. Tests

### Étape 6 : Logging Actions (1 jour)
1. Activer audit logger sur toutes les actions admin
2. Tests

## Conclusion

La sécurité souffre de :
1. Middleware sans vérification RBAC
2. API routes sans vérification RBAC
3. Server Actions sans vérification RBAC
4. Pas de rate limiting
5. Pas de validation des inputs
6. Pas de logging des actions admin

Une amélioration progressive de la sécurité est recommandée pour prévenir les accès non autorisés et assurer la traçabilité.
