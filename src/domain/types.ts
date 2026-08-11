export type SyncState = 'pending' | 'synced' | 'failed';

export type HouseStatus = 'open' | 'in_progress' | 'done' | 'skipped';

export type VisitResult =
  | 'visited'
  | 'nobody_home'
  | 'refused'
  | 'callback_requested'
  | 'skipped'
  | 'not_found';

export type PaymentType = 'cash' | 'card' | 'bank_transfer' | 'online' | 'other';

export type Person = {
  personId: number;
  firstName: string;
  lastName: string;
  email: string;
  parishId: number;
  parishName: string;
  roles: number[];
};

export type Assignment = {
  shiftId: number;
  shiftName: string;
  groupId: number;
  groupName: string;
  campaignYear: number;
  parishShort: string;
};

export type House = {
  id: string;
  groupId: number;
  shiftId: number;
  sortOrder: number;
  street: string;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  contactName: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  status: HouseStatus;
};

/**
 * Donor identity is only collected when the donor wants a tax-deductible
 * receipt. Austrian deductibility runs through the recipient organisation
 * reporting first name, last name and date of birth to FinanzOnline, so those
 * three fields plus the consent flag are what actually matter.
 */
export type Donor = {
  firstName: string;
  lastName: string;
  birthDate: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
  taxReceiptConsent: boolean;
};

export type Visit = {
  uuid: string;
  houseId: string;
  groupId: number;
  shiftId: number;
  result: VisitResult;
  note: string | null;
  createdAt: string;
  syncState: SyncState;
};

export type Donation = {
  uuid: string;
  visitUuid: string;
  houseId: string;
  amountCents: number;
  currency: string;
  paymentType: PaymentType;
  receiptNumber: string | null;
  receiptUri: string | null;
  donor: Donor | null;
  createdAt: string;
  syncState: SyncState;
};

export type TourTotals = {
  housesTotal: number;
  housesDone: number;
  visitCount: number;
  donationCount: number;
  amountCents: number;
  pendingSync: number;
};

export const VISIT_RESULT_LABELS: Record<VisitResult, string> = {
  visited: 'Besucht',
  nobody_home: 'Niemand zu Hause',
  refused: 'Kein Interesse',
  callback_requested: 'Später nochmal',
  skipped: 'Übersprungen',
  not_found: 'Adresse nicht gefunden'
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'Bargeld',
  card: 'Karte',
  bank_transfer: 'Überweisung',
  online: 'Online',
  other: 'Sonstiges'
};

export function formatAmount(amountCents: number) {
  return `€ ${(amountCents / 100).toFixed(2).replace('.', ',')}`;
}

export function formatAddress(house: House) {
  const street = [house.street, house.houseNumber].filter(Boolean).join(' ');
  const city = [house.postalCode, house.city].filter(Boolean).join(' ');

  return [street, city].filter(Boolean).join(', ');
}
