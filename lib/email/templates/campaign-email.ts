/**
 * Template HTML des emails de campagne CRM.
 *
 * CRM-CAMPAIGN-EMAIL-SIGNATURE-01 — mise en page compatible clients mail
 * (tableaux + styles en ligne), en-tête de marque et signature d'agence.
 * La signature n'affiche QUE les coordonnées réellement renseignées sur
 * l'agence (téléphone, WhatsApp, email, adresse, réseaux) : aucune valeur
 * n'est inventée ; un champ absent n'est simplement pas rendu.
 */

export interface CampaignEmailSignature {
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  address?: string | null
  /** URL publique du site (lien « site web » et logo par défaut). */
  siteUrl?: string | null
  /** Logo de l'agence ; à défaut, logo Easy2Book servi par le site. */
  logoUrl?: string | null
  facebookUrl?: string | null
  instagramUrl?: string | null
  tiktokUrl?: string | null
}

export interface CampaignEmailTemplateInput {
  campaignName: string
  message: string
  agencyName?: string
  /** Lien de désinscription (CRM-CAMPAIGN-SAFETY-01, obligatoire). */
  unsubscribeUrl: string
  signature?: CampaignEmailSignature
}

const NAVY = "#13233f"
const CORAL = "#c8262c"
const GOLD = "#e0a43c"
const INK = "#1f2937"
const MUTED = "#6b7280"
const LINE = "#e7e2d8"
const PAPER = "#f6f3ee"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Seules les URL http(s) sont rendues en lien (pas de javascript:, data:…). */
function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "")
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

function contactLine(label: string, valueHtml: string): string {
  return `<tr><td style="padding:2px 0;font-size:13px;line-height:20px;color:${INK}"><span style="display:inline-block;min-width:76px;color:${MUTED}">${label}</span>${valueHtml}</td></tr>`
}

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${NAVY};text-decoration:none;font-weight:600">${text}</a>`
}

function renderSignature(
  agencyName: string,
  s: CampaignEmailSignature,
): string {
  const rows: string[] = []

  if (s.phone) {
    rows.push(
      contactLine(
        "Téléphone",
        link(`tel:${digitsOnly(s.phone)}`, escapeHtml(s.phone)),
      ),
    )
  }
  if (s.whatsapp) {
    const wa = digitsOnly(s.whatsapp).replace(/^\+/, "")
    rows.push(
      contactLine(
        "WhatsApp",
        link(`https://wa.me/${wa}`, escapeHtml(s.whatsapp)),
      ),
    )
  }
  if (s.email) {
    rows.push(
      contactLine("Email", link(`mailto:${s.email}`, escapeHtml(s.email))),
    )
  }
  const site = safeHttpUrl(s.siteUrl)
  if (site) {
    rows.push(
      contactLine(
        "Site web",
        link(
          site,
          escapeHtml(site.replace(/^https?:\/\//i, "").replace(/\/+$/, "")),
        ),
      ),
    )
  }
  if (s.address) {
    rows.push(contactLine("Adresse", escapeHtml(s.address)))
  }

  const socials = [
    ["Facebook", safeHttpUrl(s.facebookUrl)],
    ["Instagram", safeHttpUrl(s.instagramUrl)],
    ["TikTok", safeHttpUrl(s.tiktokUrl)],
  ].filter((entry): entry is [string, string] => entry[1] !== null)

  const socialsHtml = socials.length
    ? `<tr><td style="padding-top:10px;font-size:12px;line-height:18px">${socials
        .map(
          ([name, url]) =>
            `<a href="${escapeHtml(url)}" style="display:inline-block;margin-right:8px;padding:4px 10px;border:1px solid ${LINE};border-radius:999px;color:${NAVY};text-decoration:none;font-weight:600">${name}</a>`,
        )
        .join("")}</td></tr>`
    : ""

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid ${LINE}">
  <tr><td style="padding-top:20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="border-left:3px solid ${CORAL};padding-left:14px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size:13px;color:${MUTED};padding-bottom:2px">Bien cordialement,</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:${NAVY};padding-bottom:2px">L'équipe ${agencyName}</td></tr>
          <tr><td style="font-size:12px;color:${GOLD};font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding-bottom:10px">Votre agence de voyage</td></tr>
          ${rows.join("\n          ")}
          ${socialsHtml}
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>`
}

export function renderCampaignEmailHtml(
  input: CampaignEmailTemplateInput,
): string {
  const { campaignName, message, unsubscribeUrl } = input
  const signature = input.signature ?? {}
  const agencyName = escapeHtml(input.agencyName ?? "Easy2Book")
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>")
  const escapedTitle = escapeHtml(campaignName)
  const escapedUnsubscribe = escapeHtml(unsubscribeUrl)

  const site = safeHttpUrl(signature.siteUrl)
  const logo =
    safeHttpUrl(signature.logoUrl) ??
    (site ? `${stripTrailingSlash(site)}/easy2book-logo.png` : null)
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0">`
    : ""

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${LINE}">
        <tr><td style="background:${NAVY};padding:18px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${logoHtml ? `<td style="vertical-align:middle;background:#ffffff;border-radius:10px;padding:4px">${logoHtml}</td><td style="width:12px">&nbsp;</td>` : ""}
              <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.02em">${agencyName}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="height:3px;background:${CORAL};line-height:3px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 28px 28px">
          <div style="font-size:15px;line-height:1.65;color:${INK}">${escapedMessage}</div>
          ${renderSignature(agencyName, signature)}
        </td></tr>
        <tr><td style="background:${PAPER};padding:16px 28px;border-top:1px solid ${LINE};font-size:11px;line-height:17px;color:${MUTED}">
          Vous recevez ce message car vous avez accepté de recevoir les offres de ${agencyName}.<br>
          <a href="${escapedUnsubscribe}" style="color:${MUTED};text-decoration:underline">Se désinscrire</a> — vous ne recevrez plus nos offres par email. Les emails liés à vos réservations continueront de vous être envoyés.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
