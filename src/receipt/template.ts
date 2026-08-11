import {
  RECEIPT_ISSUER_ADDRESS,
  RECEIPT_ISSUER_NAME,
  RECEIPT_ISSUER_REG_NUMBER
} from '../config/env';
import { PAYMENT_TYPE_LABELS, formatAddress, formatAmount } from '../domain/types';
import type { Assignment, Donation, House, Person } from '../domain/types';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string) {
  const date = new Date(iso);

  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function row(label: string, value: string) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

/**
 * The template lives in the app only for this prototype. It should come from
 * GET /config so the legal wording can be corrected without an app release.
 */
export function buildReceiptHtml(input: {
  donation: Donation;
  house: House;
  assignment: Assignment;
  person: Person;
}) {
  const { donation, house, assignment, person } = input;
  const donor = donation.donor;

  const donorBlock = donor
    ? [
        row('Name', `${donor.firstName} ${donor.lastName}`.trim()),
        donor.birthDate ? row('Geburtsdatum', donor.birthDate) : '',
        donor.street ? row('Adresse', [donor.street, donor.postalCode, donor.city].filter(Boolean).join(', ')) : '',
        donor.email ? row('E-Mail', donor.email) : ''
      ].join('')
    : row('Spender*in', 'Anonyme Spende');

  const taxBlock = donor?.taxReceiptConsent
    ? `<p class="legal">
         Die Spenderin bzw. der Spender hat der Übermittlung von Vor- und Zunamen sowie
         Geburtsdatum an das Finanzamt zugestimmt. Die Absetzbarkeit der Spende erfolgt
         über diese Datenübermittlung durch ${escapeHtml(RECEIPT_ISSUER_NAME)}; dieser Beleg
         dient als Bestätigung des Erhalts.
       </p>`
    : `<p class="legal">
         Für diesen Beleg wurde keine Zustimmung zur Datenübermittlung an das Finanzamt
         erteilt. Der Beleg bestätigt ausschließlich den Erhalt der Spende.
       </p>`;

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
      header { border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 26px; }
      .issuer { font-size: 17px; font-weight: 700; }
      .issuer-meta { color: #475569; font-size: 12px; margin-top: 4px; line-height: 1.5; }
      h1 { font-size: 23px; margin: 0 0 4px; }
      .receipt-no { color: #475569; font-size: 13px; margin-bottom: 26px; }
      .amount { background: #0f172a; color: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 26px; }
      .amount-label { font-size: 12px; opacity: 0.8; letter-spacing: 0.08em; text-transform: uppercase; }
      .amount-value { font-size: 32px; font-weight: 800; margin-top: 6px; }
      h2 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569; margin: 22px 0 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; font-weight: 600; color: #475569; width: 38%; padding: 6px 0; vertical-align: top; }
      td { padding: 6px 0; vertical-align: top; }
      .legal { font-size: 11px; color: #475569; line-height: 1.6; margin-top: 22px; }
      footer { margin-top: 34px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <header>
      <div class="issuer">${escapeHtml(RECEIPT_ISSUER_NAME)}</div>
      <div class="issuer-meta">
        ${escapeHtml(RECEIPT_ISSUER_ADDRESS)}
        ${RECEIPT_ISSUER_REG_NUMBER ? `<br />Registrierungsnummer: ${escapeHtml(RECEIPT_ISSUER_REG_NUMBER)}` : ''}
      </div>
    </header>

    <h1>Spendenbestätigung</h1>
    <div class="receipt-no">
      Belegnummer ${escapeHtml(donation.receiptNumber ?? '—')} &nbsp;·&nbsp; ${escapeHtml(formatDate(donation.createdAt))}
    </div>

    <div class="amount">
      <div class="amount-label">Erhaltener Betrag</div>
      <div class="amount-value">${escapeHtml(formatAmount(donation.amountCents))}</div>
    </div>

    <h2>Spender*in</h2>
    <table>${donorBlock}</table>

    <h2>Spendendetails</h2>
    <table>
      ${row('Zahlungsart', PAYMENT_TYPE_LABELS[donation.paymentType])}
      ${row('Adresse des Besuchs', formatAddress(house))}
      ${row('Aktion', `Sternsingen ${assignment.campaignYear}`)}
      ${row('Gruppe', `${assignment.groupName} (${assignment.shiftName})`)}
      ${row('Erfasst von', `${person.firstName} ${person.lastName}`.trim())}
      ${row('Pfarre', person.parishName)}
    </table>

    ${taxBlock}

    <footer>
      Dieser Beleg wurde am Gerät der Sternsingergruppe erstellt und ist ohne Unterschrift gültig.
    </footer>
  </body>
</html>`;
}
