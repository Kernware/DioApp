import { useCallback, useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { getDonation } from '../db/entries';
import { PAYMENT_TYPE_LABELS, formatAddress, formatAmount } from '../domain/types';
import type { Donation } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { generateReceiptPdf, printReceiptPdf, shareReceiptPdf } from '../receipt/generate';
import { useTour } from '../tour/TourContext';
import { Button, Card, Notice, Pill } from '../ui/components';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Receipt'>;

export function ReceiptScreen({ navigation, route }: Props) {
  const { person } = useAuth();
  const { assignment, houses } = useTour();
  const [donation, setDonation] = useState<Donation | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    const loaded = await getDonation(route.params.donationUuid);

    if (!loaded) {
      setError('Diese Spende wurde nicht gefunden.');
      return;
    }

    setDonation(loaded);

    const house = houses.find((candidate) => candidate.id === loaded.houseId);

    if (!house || !assignment || !person) {
      setError('Der Beleg kann ohne Adresse und Gruppenzuordnung nicht erstellt werden.');
      return;
    }

    try {
      const uri = loaded.receiptUri ?? (await generateReceiptPdf({ donation: loaded, house, assignment, person }));
      setPdfUri(uri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Beleg konnte nicht erstellt werden.');
    }
  }, [assignment, houses, person, route.params.donationUuid]);

  useEffect(() => {
    void build();
  }, [build]);

  const house = donation
    ? houses.find((candidate) => candidate.id === donation.houseId) ?? null
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Spende erfasst</Text>
          <Pill label="Offline gespeichert" tone="success" />
        </View>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {donation ? (
          <>
            <Card style={styles.amountCard}>
              <Text style={styles.amountLabel}>Betrag</Text>
              <Text style={styles.amountValue}>{formatAmount(donation.amountCents)}</Text>
              <Text style={styles.receiptNumber}>Beleg {donation.receiptNumber}</Text>
            </Card>

            <Card>
              <Row label="Adresse" value={house ? formatAddress(house) : '—'} />
              <Row label="Zahlungsart" value={PAYMENT_TYPE_LABELS[donation.paymentType]} />
              <Row
                label="Spender*in"
                value={
                  donation.donor
                    ? `${donation.donor.firstName} ${donation.donor.lastName}`.trim()
                    : 'Anonyme Spende'
                }
              />
              <Row
                label="Datenübermittlung"
                value={donation.donor?.taxReceiptConsent ? 'Zugestimmt' : 'Nicht zugestimmt'}
              />
            </Card>

            {pdfUri ? (
              <>
                <Button
                  label="Beleg senden oder teilen"
                  onPress={() => void shareReceiptPdf(pdfUri).catch(() => undefined)}
                />
                <View style={styles.gap} />
                <Button
                  label="Beleg drucken"
                  onPress={() => void printReceiptPdf(pdfUri).catch(() => undefined)}
                  variant="secondary"
                />
              </>
            ) : (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingLabel}>Beleg wird erstellt…</Text>
              </View>
            )}

            <View style={styles.gap} />
            <Button
              label="Weiter zur Route"
              onPress={() => navigation.popToTop()}
              variant="secondary"
            />

            <Text style={styles.footnote}>
              Der Beleg wurde am Gerät erstellt und braucht keine Verbindung. Die Spende wird
              automatisch übertragen, sobald wieder Empfang vorhanden ist.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  amountCard: { backgroundColor: colors.ink, borderColor: colors.ink },
  amountLabel: { color: '#cbd5e1', fontSize: 13, marginBottom: 6 },
  amountValue: { color: '#ffffff', fontSize: 34, fontWeight: '800' },
  receiptNumber: { color: '#cbd5e1', fontSize: 13, marginTop: 8 },
  row: { flexDirection: 'row', paddingVertical: 7 },
  rowLabel: { color: colors.inkSubtle, fontSize: 14, width: 140 },
  rowValue: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '600' },
  loading: { alignItems: 'center', paddingVertical: 20 },
  loadingLabel: { color: colors.inkSubtle, fontSize: 13, marginTop: 10 },
  gap: { height: 10 },
  footnote: { color: colors.inkSubtle, fontSize: 12, lineHeight: 19, marginTop: 20 }
});
