import { useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import {
  PAYMENT_TYPE_LABELS,
  VISIT_RESULT_LABELS,
  formatAddress,
  formatAmount
} from '../domain/types';
import type { Donor, PaymentType, VisitResult } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { BankTransferQr } from '../payments/BankTransferQr';
import { PaymentLinkQr } from '../payments/PaymentLinkQr';
import { useTour } from '../tour/TourContext';
import { Button, Card, Chip, Field, Notice, SectionTitle } from '../ui/components';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Visit'>;

const AMOUNT_PRESETS = [500, 1000, 2000, 5000];
const RESULTS: VisitResult[] = [
  'visited',
  'nobody_home',
  'refused',
  'callback_requested',
  'not_found'
];
const PAYMENT_TYPES: PaymentType[] = ['cash', 'card', 'bank_transfer'];

const EMPTY_DONOR: Donor = {
  firstName: '',
  lastName: '',
  birthDate: '',
  street: '',
  postalCode: '',
  city: '',
  email: '',
  taxReceiptConsent: false
};

function parseAmount(input: string) {
  const normalised = input.replace(/\s/g, '').replace(',', '.');
  const value = Number.parseFloat(normalised);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value * 100);
}

export function VisitScreen({ navigation, route }: Props) {
  const { houses, recordVisit } = useTour();
  const house = useMemo(
    () => houses.find((candidate) => candidate.id === route.params.houseId) ?? null,
    [houses, route.params.houseId]
  );

  const [result, setResult] = useState<VisitResult>('visited');
  const [note, setNote] = useState('');
  const [presetAmount, setPresetAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [wantsReceipt, setWantsReceipt] = useState(false);
  const [donor, setDonor] = useState<Donor>(EMPTY_DONOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = customAmount.trim() ? parseAmount(customAmount) : (presetAmount ?? 0);
  const collectsMoney = result === 'visited';

  const updateDonor = (patch: Partial<Donor>) => setDonor((current) => ({ ...current, ...patch }));

  if (!house) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Notice tone="danger">Diese Adresse ist nicht mehr in der Route.</Notice>
        </View>
      </SafeAreaView>
    );
  }

  const hasAmount = () => {
    if (amountCents <= 0) {
      Alert.alert('Betrag fehlt', 'Wähle zuerst einen Betrag aus.');
      return false;
    }

    return true;
  };

  const save = async () => {
    if (wantsReceipt && (!donor.firstName.trim() || !donor.lastName.trim() || !donor.birthDate.trim())) {
      setError(
        'Für die Spendenbestätigung brauchen wir Vorname, Nachname und Geburtsdatum der spendenden Person.'
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const donation = await recordVisit({
        house,
        result,
        note,
        donation:
          collectsMoney && amountCents > 0
            ? {
                amountCents,
                paymentType,
                donor: wantsReceipt ? { ...donor, taxReceiptConsent: donor.taxReceiptConsent } : null
              }
            : null
      });

      if (donation) {
        navigation.replace('Receipt', { donationUuid: donation.uuid });
        return;
      }

      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.address}>{formatAddress(house)}</Text>
          {house.contactName ? <Text style={styles.contact}>{house.contactName}</Text> : null}
          {house.note ? <Notice tone="neutral">{house.note}</Notice> : null}

          {error ? <Notice tone="danger">{error}</Notice> : null}

          <SectionTitle>Ergebnis</SectionTitle>
          <View style={styles.chipGrid}>
            {RESULTS.map((option) => (
              <Chip
                key={option}
                label={VISIT_RESULT_LABELS[option]}
                onPress={() => setResult(option)}
                selected={result === option}
              />
            ))}
          </View>

          {collectsMoney ? (
            <>
              <SectionTitle>Spende</SectionTitle>
              <Card>
                <Text style={styles.amountValue}>{formatAmount(amountCents)}</Text>
                <View style={styles.chipGrid}>
                  {AMOUNT_PRESETS.map((option) => (
                    <Chip
                      key={option}
                      label={formatAmount(option)}
                      onPress={() => {
                        setPresetAmount(option);
                        setCustomAmount('');
                      }}
                      selected={!customAmount.trim() && presetAmount === option}
                    />
                  ))}
                </View>
                <View style={styles.spacer} />
                <Field
                  label="Anderer Betrag"
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setCustomAmount}
                  placeholder="z. B. 7,50"
                  value={customAmount}
                />
                <Text style={styles.inlineLabel}>Zahlungsart</Text>
                <View style={styles.chipGrid}>
                  {PAYMENT_TYPES.map((option) => (
                    <Chip
                      key={option}
                      label={PAYMENT_TYPE_LABELS[option]}
                      onPress={() => setPaymentType(option)}
                      selected={paymentType === option}
                    />
                  ))}
                </View>
                {paymentType === 'card' ? (
                  <View style={styles.spacer}>
                    <Button
                      label="Tap to Pay vorbereiten"
                      onPress={() => {
                        if (!hasAmount()) {
                          return;
                        }

                        navigation.navigate('Payment', { amountCents });
                      }}
                      variant="secondary"
                    />
                    <PaymentLinkQr amountCents={amountCents} />
                  </View>
                ) : null}
                {paymentType === 'bank_transfer' ? <BankTransferQr amountCents={amountCents} /> : null}
              </Card>

              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>Spendenbestätigung gewünscht</Text>
                  <Text style={styles.toggleHint}>
                    Nur nötig, wenn die Spende steuerlich abgesetzt werden soll.
                  </Text>
                </View>
                <Switch onValueChange={setWantsReceipt} value={wantsReceipt} />
              </View>

              {wantsReceipt ? (
                <Card>
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
                    hint="Das Finanzamt ordnet die Spende über Name und Geburtsdatum zu."
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
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleText}>
                      <Text style={styles.toggleLabel}>Zustimmung zur Datenübermittlung</Text>
                      <Text style={styles.toggleHint}>
                        Name und Geburtsdatum dürfen an das Finanzamt übermittelt werden.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={(value) => updateDonor({ taxReceiptConsent: value })}
                      value={donor.taxReceiptConsent}
                    />
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}

          <SectionTitle>Notiz</SectionTitle>
          <Field
            label="Anmerkung zu diesem Haus"
            multiline
            onChangeText={setNote}
            placeholder="z. B. Hund im Garten, nächstes Jahr später kommen"
            style={styles.multiline}
            value={note}
          />

          <Button
            busy={busy}
            label={amountCents > 0 && collectsMoney ? 'Speichern und Beleg erstellen' : 'Speichern'}
            onPress={() => void save()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  address: { color: colors.ink, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  contact: { color: colors.inkSubtle, fontSize: 15, marginBottom: 14 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  amountValue: { color: colors.ink, fontSize: 32, fontWeight: '800', marginBottom: 14 },
  inlineLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6
  },
  spacer: { marginTop: 4 },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    padding: 16
  },
  toggleText: { flex: 1, paddingRight: 12 },
  toggleLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  toggleHint: { color: colors.inkSubtle, fontSize: 12, lineHeight: 18, marginTop: 3 },
  row: { flexDirection: 'row', gap: 10 },
  rowNarrow: { flex: 1 },
  rowWide: { flex: 2 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }
});
