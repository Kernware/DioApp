export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4242';

export const PAYMENT_LINK_URL =
  process.env.EXPO_PUBLIC_PAYMENT_LINK_URL ?? '';

/** Public URL the donor's phone can open for the donor-details form. */
export const INVOICE_FORM_BASE_URL =
  process.env.EXPO_PUBLIC_INVOICE_FORM_BASE_URL ?? '';

export const TERMINAL_LOCATION_ID =
  process.env.EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID ?? '';

export const TERMINAL_SIMULATED =
  process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED !== 'false';

export const APPLE_MERCHANT_IDENTIFIER =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER ?? '';

export const MOBILE_API_URL =
  process.env.EXPO_PUBLIC_MOBILE_API_URL ?? `${API_URL}/api/v1/mobile`;

/**
 * With no backend address configured there is nothing to talk to, so the app
 * answers its own requests locally instead of failing at the login screen.
 * Any real deployment sets an API URL and therefore never lands in demo mode.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE
  ? process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
  : !process.env.EXPO_PUBLIC_MOBILE_API_URL && !process.env.EXPO_PUBLIC_API_URL;

// Receipt issuer defaults. In production these belong in the payload of
// GET /config so the legal texts can change without an app release.
export const RECEIPT_ISSUER_NAME =
  process.env.EXPO_PUBLIC_RECEIPT_ISSUER_NAME ?? 'Dreikönigsaktion der Katholischen Jungschar';
export const RECEIPT_ISSUER_ADDRESS =
  process.env.EXPO_PUBLIC_RECEIPT_ISSUER_ADDRESS ?? 'Wilhelminenstraße 91/II f, 1160 Wien';
export const RECEIPT_ISSUER_REG_NUMBER =
  process.env.EXPO_PUBLIC_RECEIPT_ISSUER_REG_NUMBER ?? '';

export const BANK_QR_IBAN = process.env.EXPO_PUBLIC_BANK_QR_IBAN ?? '';
export const BANK_QR_BIC = process.env.EXPO_PUBLIC_BANK_QR_BIC ?? '';
export const BANK_QR_NAME =
  process.env.EXPO_PUBLIC_BANK_QR_NAME ?? 'DIO Payments';
export const BANK_QR_REFERENCE =
  process.env.EXPO_PUBLIC_BANK_QR_REFERENCE ?? 'Spende';
