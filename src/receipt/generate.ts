import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { attachReceipt } from '../db/entries';
import { buildReceiptHtml } from './template';
import type { Assignment, Donation, House, Person } from '../domain/types';

/**
 * Renders the receipt entirely on the device so it works with no signal at the
 * door. The file stays in the app cache for this prototype; production should
 * move it into a persistent directory before the OS can evict it.
 */
export async function generateReceiptPdf(input: {
  donation: Donation;
  house: House;
  assignment: Assignment;
  person: Person;
}) {
  const { uri } = await Print.printToFileAsync({
    html: buildReceiptHtml(input),
    base64: false
  });

  if (input.donation.receiptNumber) {
    await attachReceipt(input.donation.uuid, input.donation.receiptNumber, uri);
  }

  return uri;
}

export async function shareReceiptPdf(uri: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Auf diesem Gerät ist kein Teilen verfügbar.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Spendenbestätigung senden',
    UTI: 'com.adobe.pdf'
  });
}

export function printReceiptPdf(uri: string) {
  return Print.printAsync({ uri });
}
