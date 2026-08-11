import { BANK_QR_BIC, BANK_QR_IBAN, BANK_QR_NAME, BANK_QR_REFERENCE } from '../config/env';

function isValidIban(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return false;
  }

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;

  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

/** EPC QR (European Payments Council) payload for a direct SEPA transfer. */
export function buildSepaQrPayload(amountCents: number) {
  const iban = BANK_QR_IBAN.replace(/\s/g, '').trim();

  if (amountCents <= 0 || !isValidIban(iban)) {
    return null;
  }

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    BANK_QR_BIC.trim().toUpperCase(),
    BANK_QR_NAME.trim(),
    iban,
    `EUR${(amountCents / 100).toFixed(2)}`,
    '',
    BANK_QR_REFERENCE.trim()
  ].join('\n');
}
