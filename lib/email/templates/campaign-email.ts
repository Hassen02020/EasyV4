/**
 * Template HTML minimaliste pour les emails de campagne CRM.
 * Aucune PJ, pas de mise en page complexe — texte de la campagne, branding minimal.
 */

export interface CampaignEmailTemplateInput {
  campaignName: string
  message: string
  agencyName?: string
  /** Lien de désinscription (CRM-CAMPAIGN-SAFETY-01, obligatoire). */
  unsubscribeUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderCampaignEmailHtml(
  input: CampaignEmailTemplateInput,
): string {
  const { campaignName, message, unsubscribeUrl } = input
  const agencyName = escapeHtml(input.agencyName ?? "Easy2Book")
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>")
  const escapedTitle = escapeHtml(campaignName)
  const escapedUnsubscribe = escapeHtml(unsubscribeUrl)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; }
    .card { background: #fff; border-radius: 8px; max-width: 600px; margin: 0 auto; padding: 32px; }
    .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
    .agency { font-size: 13px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .message { font-size: 15px; color: #111827; line-height: 1.6; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="agency">${agencyName}</div>
    </div>
    <div class="message">${escapedMessage}</div>
    <div class="footer">
      Vous recevez ce message car vous avez accepté de recevoir les offres de ${agencyName}.<br>
      <a href="${escapedUnsubscribe}" style="color:#6b7280">Se désinscrire</a> — vous ne recevrez plus nos offres par email.
    </div>
  </div>
</body>
</html>`
}
