/**
 * VoucherEmail — Template HTML synchrone pour Resend.
 *
 * Pas de dépendance React Email — simple string HTML pour
 * une compatibilité maximale et zéro overhead bundle.
 */

export interface VoucherEmailProps {
  customerName: string
  publicRef: string
  hotelName: string
  checkIn: string
  checkOut: string
  nights: number
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/**
 * Génère le HTML de l'email de voucher hôtel.
 * Compatible Resend `html` field (string synchrone).
 */
export function renderVoucherEmailHtml(props: VoucherEmailProps): string {
  const { customerName, publicRef, hotelName, checkIn, checkOut, nights } = props

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Voucher ${publicRef}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:24px 32px;">
              <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;">Easy2Book</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#93c5fd;">Voucher de Confirmation</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1f2937;">
                Bonjour <strong>${customerName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                Votre réservation a été <strong style="color:#059669;">confirmée</strong>. Retrouvez votre voucher en pièce jointe.
              </p>
              <!-- Reservation card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                    <strong style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">N° Réservation</strong>
                    <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#1e40af;">${publicRef}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;width:35%;">Hôtel</td>
                        <td style="padding:6px 0;font-size:14px;font-weight:600;">${hotelName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Check-in</td>
                        <td style="padding:6px 0;font-size:14px;">${formatDate(checkIn)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Check-out</td>
                        <td style="padding:6px 0;font-size:14px;">${formatDate(checkOut)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Nuitées</td>
                        <td style="padding:6px 0;font-size:14px;">${nights} nuit${nights > 1 ? "s" : ""}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://easy2book.tn"}/booking/confirmation/${publicRef}"
                       style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;">
                      Voir ma réservation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                Ce voucher fait office de confirmation. Présentez-le à l'hôtel lors de votre arrivée.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;text-align:center;">
                Easy2Book — Plateforme de réservation B2B — Tunisie
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
