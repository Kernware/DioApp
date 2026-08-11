import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { API_URL, DEMO_MODE, INVOICE_FORM_BASE_URL } from '../config/env';
import { formatAmount } from '../domain/types';
import { Button, Field, Notice } from '../ui/components';
import { colors } from '../ui/theme';

type InvoiceQrProps = {
  amountCents: number;
};

type InvoiceRequest = {
  id: string | null;
  url: string;
  expiresAt: string | null;
  previewOnly: boolean;
};

type InvoiceDonor = {
  firstName: string;
  lastName: string;
  birthDate: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
  taxReceiptConsent: boolean;
};

const EMPTY_DONOR: InvoiceDonor = {
  firstName: '',
  lastName: '',
  birthDate: '',
  street: '',
  postalCode: '',
  city: '',
  email: '',
  taxReceiptConsent: false
};

export function InvoiceQr({ amountCents }: InvoiceQrProps) {
  const [request, setRequest] = useState<InvoiceRequest | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donor, setDonor] = useState<InvoiceDonor>(EMPTY_DONOR);
  const selectedAmount = useRef(amountCents);

  useEffect(() => {
    selectedAmount.current = amountCents;
    setRequest(null);
    setFormVisible(false);
    setSaved(false);
    setError(null);
  }, [amountCents]);

  const updateDonor = (patch: Partial<InvoiceDonor>) => setDonor((current) => ({ ...current, ...patch }));

  const create = async () => {
    const forAmount = amountCents;

    if (forAmount <= 0) {
      setError('Wähle zuerst einen Betrag.');
      return;
    }

    setBusy(true);
    setRequest(null);
    setFormVisible(false);
    setSaved(false);
    setError(null);

    try {
      if (DEMO_MODE) {
        const base = (INVOICE_FORM_BASE_URL || API_URL).replace(/\/$/, '');
        const url = `${base}/invoice/demo?amount_cents=${forAmount}`;

        setRequest({ id: null, url, expiresAt: null, previewOnly: true });
        return;
      }

      const response = await fetch(`${API_URL}/create-invoice-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: forAmount, currency: 'eur' })
      });
      const body = (await response.json()) as {
        id?: string;
        url?: string;
        expiresAt?: string;
        error?: string;
      };

      if (!response.ok || !body.id || !body.url) {
        throw new Error(body.error || 'Der Beleg-Link konnte nicht erstellt werden.');
      }

      if (selectedAmount.current === forAmount) {
        setRequest({
          id: body.id,
          url: body.url,
          expiresAt: body.expiresAt ?? null,
          previewOnly: false
        });
      }
    } catch (caught) {
      if (selectedAmount.current === forAmount) {
        setError(caught instanceof Error ? caught.message : 'Der Beleg-Link konnte nicht erstellt werden.');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleForm = () => {
    setError(null);
    setFormVisible((visible) => !visible);
  };

  const save = () => {
    if (!donor.firstName.trim() || !donor.lastName.trim() || !donor.birthDate.trim()) {
      setError('Beleg braucht Vorname, Nachname und Geburtsdatum.');
      return;
    }

    setError(null);
    setSaved(true);
    setFormVisible(false);
  };

  return (
    <View style={styles.container}>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {saved ? <Notice tone="success">Belegdaten für {formatAmount(amountCents)} erfasst.</Notice> : null}
      {request?.previewOnly ? <Notice tone="warning">Demo-Version: Backend nicht aufgesetzt.</Notice> : null}

      {request ? (
        <>
          <View style={styles.qr}>
            <QRCode backgroundColor={colors.surface} color={colors.ink} size={190} value={request.url} />
            <Text style={styles.amount}>{formatAmount(amountCents)}</Text>
            <Text style={styles.reference}>Scannen und Belegdaten eintragen</Text>
          </View>
          <Button
            label={formVisible ? 'Formular ausblenden' : 'Auf diesem Gerät eingeben'}
            onPress={toggleForm}
          />
        </>
      ) : (
        <Button
          busy={busy}
          label="Beleg erstellen"
          onPress={() => void create()}
        />
      )}

      {formVisible ? (
        <View style={styles.form}>
          <Text style={styles.amount}>Beleg für {formatAmount(amountCents)}</Text>
          <Field
            label="Vorname"
            onChangeText={(value) => updateDonor({ firstName: value })}
            value={donor.firstName}
          />
          <Field
            label="Nachname"
            onChangeText={(value) => updateDonor({ lastName: value })}
            value={donor.lastName}
          />
          <Field
            label="Geburtsdatum"
            keyboardType="numbers-and-punctuation"
            onChangeText={(value) => updateDonor({ birthDate: value })}
            placeholder="TT.MM.JJJJ"
            value={donor.birthDate}
          />
          <Field
            label="Straße und Hausnummer"
            onChangeText={(value) => updateDonor({ street: value })}
            value={donor.street}
          />
          <View style={styles.row}>
            <View style={styles.rowNarrow}>
              <Field
                label="PLZ"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={(value) => updateDonor({ postalCode: value })}
                value={donor.postalCode}
              />
            </View>
            <View style={styles.rowWide}>
              <Field
                label="Ort"
                onChangeText={(value) => updateDonor({ city: value })}
                value={donor.city}
              />
            </View>
          </View>
          <Field
            label="E-Mail für den Beleg"
            autoCapitalize="none"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={(value) => updateDonor({ email: value })}
            value={donor.email}
          />
          <Button label="Belegdaten übernehmen" onPress={save} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  qr: { alignItems: 'center', paddingVertical: 16 },
  amount: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 14, marginTop: 12 },
  reference: { color: colors.inkSubtle, fontSize: 12, marginBottom: 12 },
  form: { marginTop: 14 },
  row: { flexDirection: 'row', gap: 10 },
  rowNarrow: { flex: 1 },
  rowWide: { flex: 2 },
  consentRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    padding: 14
  },
  consentText: { flex: 1, paddingRight: 12 },
  consentLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  consentHint: { color: colors.inkSubtle, fontSize: 12, lineHeight: 18, marginTop: 3 }
});
