import { test, expect } from "@playwright/test"

/**
 * HOTEL-GUEST-CREATE-LIVE-01 — premier test d'exécution RÉELLE (pas statique)
 * de `createGuestReservationFromDraft` (lib/booking/guest-actions.ts:142).
 *
 * Gap fermé : aucun test, live ou mocké, n'appelait cette fonction (vérifié
 * par grep exhaustif sur tout le dépôt, 0 résultat) — le cœur du produit
 * (création de réservation B2C) n'avait jamais été exercé en exécution.
 *
 * Pourquoi E2E et pas `node:test` : `createGuestReservationFromDraft` appelle
 * `getDefaultAgencyId()` → `unstable_cache` (Next.js), qui lève
 * `Invariant: incrementalCache missing` hors du runtime Next.js réel (prouvé
 * empiriquement par une sonde jetable avant ce fichier) — impossible à
 * appeler comme un simple import depuis `node:test`, même avec un serveur
 * tournant par ailleurs pour la confirmation fournisseur. Le vrai chemin de
 * production est `components/cart/cart-view.tsx`/`checkout-form.tsx` →
 * `submitCheckoutAction` (lib/booking/actions.ts:1035) → cette fonction,
 * déclenché par un vrai clic navigateur, donc un vrai contexte Next.js.
 *
 * Doit tourner contre `pnpm dev`, JAMAIS `pnpm build && pnpm start` — conflit
 * structurel réel, vérifié empiriquement deux fois (logs serveur à l'appui) :
 * `next start` force toujours `NODE_ENV=production`, quel que soit l'env
 * passé, et `lib/mygo/config.ts::resolveMyGoMode()` lève explicitement
 * "MYGO_MODE=virtual est interdit en production" dans ce cas — la recherche
 * hôtel tombe alors en mode dégradé ("Le service hôtelier est temporairement
 * indisponible"), jamais un simple problème de sélecteur. `pnpm dev` ne force
 * pas NODE_ENV=production, donc ne déclenche pas cette garde — vérifié sous
 * `pnpm dev` + MYGO_MODE=virtual (Postgres local démarré, voir lib/db/README.md
 * pour pg_ctlcluster) : recherche réelle avec résultats (vérifié par capture
 * du snapshot d'accessibilité Playwright, compteurs de filtres non nuls).
 * L'inquiétude HOTEL-SEARCH-01 (hydratation `pnpm dev`/Turbopack) concernait un
 * symptôme différent (menus déroulants du moteur de recherche HOMEPAGE) — non
 * reproduite ici : combobox destination, date-picker et formulaire de
 * recherche fonctionnent normalement sous `pnpm dev` dans ce test.
 *
 * CONSÉQUENCE IMPORTANTE (CI) : playwright.config.ts lance `pnpm start` en CI
 * (`CI` défini) — ce test ne peut donc PAS tourner dans le job CI standard
 * tel quel : il nécessite spécifiquement `pnpm dev` + MYGO_MODE=virtual, une
 * combinaison que `next start`/CI interdit structurellement. Ce test est pour
 * l'instant une preuve d'exécution réelle en labo local uniquement (invocation
 * manuelle), pas (encore) un gate CI automatique — à documenter explicitement
 * dans ROADMAP.md plutôt que de prétendre une couverture CI qui n'existe pas.
 *
 * Mode paiement choisi : "cash" ("Espèces en agence") — aucune capture PSP,
 * réservation créée `status: "pending"`, exactement le chemin documenté
 * dans lib/booking/guest-actions.ts:33-37.
 *
 * Nettoyage : comme les 18 autres specs de e2e/, aucun nettoyage DB direct
 * ici (Postgres local jetable de ce labo, pas un accès DB depuis ce
 * fichier — cohérent avec le reste de e2e/, aucune autre spec n'y touche).
 */

test.describe("HOTEL-GUEST-CREATE-LIVE-01 — réservation hôtel guest réelle", () => {
  test("recherche → sélection chambre → voyageur → paiement espèces → confirmation avec référence réelle", async ({
    page,
  }) => {
    // Timeout du test (pas juste des assertions individuelles) relevé :
    // sous `pnpm dev`/Turbopack, chaque route traversée (accueil, résultats,
    // booking, travelers, checkout, confirmation) compile à la demande au
    // premier accès — mesuré une fois dépassant les 30s par défaut alors que
    // chaque étape individuelle réussissait (recherche avec résultats réels
    // obtenue en ~26s sur ce run).
    test.setTimeout(90_000)

    // 1. Recherche hôtel (patron identique à hotel-search.spec.ts)
    await page.goto("/")
    await page.getByRole("tab", { name: /Hôtels Tunisie/i }).click()
    await page.getByRole("combobox", { name: /Destination/i }).click()
    await page.getByText("Hammamet").first().click()

    // Sélecteur par numéro de jour seul (ex. "3") matche en sous-chaîne
    // n'importe quelle cellule le contenant ("31 octobre", "13 novembre"...)
    // — avec deux mois affichés côte à côte, `.first()` peut tomber sur une
    // date passée désactivée d'un autre mois (bug confirmé, reproduit
    // indépendamment sur hotel-search.spec.ts existant, hors périmètre de ce
    // fichier). Un libellé complet seul ne suffit pas non plus : le panneau
    // du mois suivant affiche aussi, grisés, les derniers jours du mois
    // précédent pour la continuité visuelle (ex. "27 octobre" apparaît à la
    // fois dans le panneau "octobre 2026" ET dans le panneau "novembre
    // 2026") — deux cellules de même nom accessible. On scope donc d'abord
    // par panneau de mois (`getByLabel("<mois> <année>", {exact:true})`,
    // confirmé par le message d'erreur Playwright lui-même), qui ne peut
    // matcher qu'un seul panneau réel.
    const dayLabel = (d: Date) =>
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d)
    const monthPanelLabel = (d: Date) =>
      new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
        .format(d)
        .toLowerCase()

    await page.getByRole("combobox", { name: /Dates du séjour/i }).click()
    const today = new Date()
    const checkIn = new Date(today)
    checkIn.setDate(today.getDate() + 7)
    const checkOut = new Date(today)
    checkOut.setDate(today.getDate() + 14)
    await page
      .getByLabel(monthPanelLabel(checkIn), { exact: true })
      .getByRole("gridcell", { name: dayLabel(checkIn), exact: true })
      .click()
    await page
      .getByLabel(monthPanelLabel(checkOut), { exact: true })
      .getByRole("gridcell", { name: dayLabel(checkOut), exact: true })
      .click()

    await page.getByRole("button", { name: /RECHERCHER/i }).click()
    await page.waitForURL(/.*hotels\/search.*/)
    await expect(page.getByRole("heading", { name: /résultat/i })).toBeVisible({
      timeout: 15_000,
    })

    // 2. Scope explicite sur la PREMIÈRE carte hôtel — `id={`hotel-card-${hotel.id}`}`
    // (components/hotel-listings.tsx:748-750, stable, un seul par hôtel).
    // Nécessaire : `button[aria-pressed]` seul matche AUSSI le bouton
    // "Exactes" du filtre "Dates flexibles" de la sidebar (lui aussi
    // aria-pressed, plus haut dans le DOM que les cartes) — confirmé par deux
    // échecs successifs (Réserver resté `disabled` malgré un clic "réussi"
    // sur une chambre, preuve que ce n'était pas la bonne chambre, ou pas une
    // chambre du tout) avant de scoper strictement à cette carte.
    const firstCard = page.locator('[id^="hotel-card-"]').first()

    // 3. Déplie "Tarifs & chambres" — `HotelRoomRates` (détail des chambres +
    // bouton "Réserver") est gated par `isExpanded`, false par défaut
    // (components/hotel-card.tsx:138,468). Les onglets pension visibles sans
    // déplier (ex. "Logement Simple", "Demi Pension") sont les `mealOptions`
    // (components/hotel-card.tsx:447-465, rendus hors du gate `isExpanded`) —
    // un simple filtre d'affichage, pas un bouton de réservation.
    await firstCard.getByRole("button", { name: /Tarifs & chambres/i }).click()

    // 4. Sélectionne la première chambre proposée — chaque ligne est un
    // `<button aria-pressed>` (components/hotel-room-rates.tsx:120-124) ; le
    // bouton "Réserver" final reste `disabled` tant qu'aucune chambre n'est
    // sélectionnée (components/hotel-room-rates.tsx:208-219). `button[aria-pressed]`
    // seul, même scopé à `firstCard`, matche AUSSI le bouton "Ajouter aux
    // favoris" (components/hotel-card.tsx:214-220, lui aussi aria-pressed,
    // affiché plus haut dans la carte que le panneau de chambres) — confirmé
    // par deux échecs successifs (Réserver resté `disabled` malgré un clic
    // "réussi"). On cible donc explicitement le premier bouton aria-pressed
    // qui SUIT le titre "Chambres et tarifs disponibles" (roomsAndRatesTitle)
    // dans le DOM, jamais le premier aria-pressed de la carte entière.
    await firstCard
      .getByText("Chambres et tarifs disponibles", { exact: false })
      .locator("xpath=following::button[@aria-pressed][1]")
      .click()

    const bookButton = firstCard.getByRole("button", { name: /Réserver/i })
    await expect(bookButton).toBeEnabled({ timeout: 15_000 })
    await bookButton.click()

    // 4. Page booking (étape 1) — le CTA "Continuer" y est un `<Link>` (role
    // "link", navigue directement vers /booking/travelers?d=... avec le
    // brouillon déjà encodé dans l'URL), pas un `<button>` comme sur le
    // parcours offre flash homepage de booking-flow.spec.ts.
    await page.waitForURL(/.*booking\?d=.*/)
    await page.getByRole("link", { name: /Continuer/i }).click()

    // 5. Page voyageurs (étape 2)
    await page.waitForURL(/.*booking\/travelers.*/)
    // /Nom/i seul matche aussi "Prénom *" (qui se termine par "nom") — ancré
    // en début de chaîne pour cibler seulement le label "Nom *".
    await page.getByLabel(/Prénom/i).fill("Test")
    await page.getByLabel(/^Nom/i).fill("GuestCreateLive01")
    await page
      .getByLabel(/Email/i)
      .fill("test-guest-create-live-01@example.com")
    await page.getByLabel(/Téléphone/i).fill("+21698123456")
    // Numéro CIN (8 chiffres) — requis pour le module hôtel (absent du
    // parcours plus générique de booking-flow.spec.ts) ; sans lui, le
    // formulaire reste bloqué sur place avec "String must contain at least
    // 6 character(s)" sous le champ, jamais une navigation vers le checkout.
    await page.getByLabel(/Numéro CIN/i).fill("12345678")
    await page.getByRole("button", { name: /Continuer/i }).click()

    // 6. Page checkout (étape 3) — partie NOUVELLE de ce chantier
    await page.waitForURL(/.*booking\/checkout.*/)
    // Deux headings matchent /Paiement/i ("Récapitulatif & paiement" h1 et
    // "Mode de paiement" h3) — .first() cible le titre de page (h1).
    await expect(
      page.getByRole("heading", { name: /Paiement/i }).first(),
    ).toBeVisible()

    // Mode paiement "Espèces en agence" — aucune capture PSP réelle
    await page.getByRole("button", { name: /Espèces en agence/i }).click()

    // Politique d'annulation hôtel, si affichée (checkbox conditionnelle,
    // obligatoire quand la chambre choisie est non remboursable — c'était le
    // cas sur ce run). Deux bugs successifs ici : (1) `isVisible()` seul
    // n'attend pas, laissant ce checkbox non cochée si son rendu n'était pas
    // encore terminé — remplacé par `.check({timeout})`, qui attend
    // réellement ; (2) `/annulation|politique/i` matchait AUSSI la checkbox
    // CGV plus bas ("...la politique de confidentialité de Easy2Book.") —
    // violation de mode strict masquée silencieusement par le `.catch()`
    // englobant, laissant cette checkbox non cochée sans aucune erreur
    // visible avant le timeout de "Confirmer & payer". `/annulation/i` seul
    // est sans ambiguïté. `.catch()` couvre le cas légitime "annulation
    // gratuite" où ce checkbox n'existe pas du tout.
    await page
      .getByRole("checkbox", { name: /annulation/i })
      .check({ timeout: 5_000 })
      .catch(() => {})

    // CGV obligatoires
    await page
      .getByRole("checkbox", { name: /conditions générales de vente/i })
      .check()

    // 7. Soumission réelle — déclenche submitCheckoutAction → createGuestReservationFromDraft
    await page.getByRole("button", { name: /Confirmer.*payer/i }).click()

    // 8. Preuve : redirection vers une page de confirmation avec une référence réelle
    await page.waitForURL(/.*booking\/confirmation\/[A-Za-z0-9-]+\?token=.*/, {
      timeout: 20_000,
    })
    const url = new URL(page.url())
    const publicRef = url.pathname.split("/").pop()
    expect(publicRef).toBeTruthy()
    expect(publicRef).not.toBe("DOES-NOT-EXIST-000")

    // La page de confirmation est rendue server-side à partir de la ligne
    // `reservations` réellement écrite — son contenu visible EST la preuve
    // que l'écriture DB a réussi et est lisible (pas une simple redirection
    // "aveugle" : la page interroge la réservation par cette référence).
    // /Référence/i seul matche aussi "...avec cette référence" (texte
    // d'instruction plus bas sur la page) — .first() cible le libellé réel.
    await expect(page.getByText(/Référence/i).first()).toBeVisible()
    await expect(page.getByText(publicRef!)).toBeVisible()
    await expect(page.getByText(/GuestCreateLive01/i)).toBeVisible()
  })
})
