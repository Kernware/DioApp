import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { formatAmount } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useSync } from '../sync/SyncContext';
import { useTour } from '../tour/TourContext';
import { Button, Card, Field, Notice, SectionTitle } from '../ui/components';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

export function SummaryScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const { assignment, totals, tour, submitSummary } = useTour();
  const { pending, blocked, online, syncNow, retryBlocked, syncing } = useSync();
  const [note, setNote] = useState(tour?.summaryNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openHouses = totals.housesTotal - totals.housesDone;

  const submit = async () => {
    if (note.trim().length < 3) {
      setError('Schreib bitte kurz, wie die Tour gelaufen ist.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await submitSummary(note);
      Alert.alert(
        'Tour abgeschlossen',
        pending > 0 || !online
          ? 'Der Bericht ist gespeichert und wird automatisch gesendet, sobald wieder Empfang vorhanden ist.'
          : 'Der Bericht wurde an die Zentrale gesendet.',
        [{ text: 'OK', onPress: () => navigation.popToTop() }]
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Bericht konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Abmelden',
      pending > 0
        ? `Es warten noch ${pending} Einträge auf die Übertragung. Beim Abmelden werden sie gelöscht.`
        : 'Willst du dich abmelden?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: () => void signOut() }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tour abschließen</Text>
          <Text style={styles.subtitle}>
            {assignment ? `${assignment.groupName} · ${assignment.shiftName}` : 'Keine Gruppe'}
          </Text>

          {error ? <Notice tone="danger">{error}</Notice> : null}

          {openHouses > 0 ? (
            <Notice tone="warning">
              {`${openHouses} von ${totals.housesTotal} Adressen sind noch offen. Du kannst die Tour trotzdem abschließen.`}
            </Notice>
          ) : null}

          <SectionTitle>Ergebnis</SectionTitle>
          <Card>
            <Row label="Besuchte Adressen" value={`${totals.housesDone} von ${totals.housesTotal}`} />
            <Row label="Erfasste Besuche" value={String(totals.visitCount)} />
            <Row label="Spenden" value={String(totals.donationCount)} />
            <Row label="Summe" value={formatAmount(totals.amountCents)} />
          </Card>

          <SectionTitle>Übertragung</SectionTitle>
          <Card>
            <Row label="Verbindung" value={online ? 'Online' : 'Offline'} />
            <Row
              label="Offene Einträge"
              value={pending === 0 ? 'Alles gesendet' : `${pending} warten`}
            />
            {blocked > 0 ? (
              <Text style={styles.blockedHint}>
                {`${blocked} Einträge wurden vom Server abgelehnt und werden nicht mehr automatisch gesendet. Bitte die Zentrale informieren.`}
              </Text>
            ) : null}
            {pending > 0 ? (
              <View style={styles.syncAction}>
                <Button
                  busy={syncing}
                  label={blocked > 0 ? 'Erneut versuchen' : 'Jetzt senden'}
                  onPress={() => void (blocked > 0 ? retryBlocked() : syncNow())}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Card>

          <SectionTitle>Kurzbericht</SectionTitle>
          <Field
            label="Wie ist die Tour gelaufen?"
            hint="Zum Beispiel Startzeit, Endzeit, ausgegebene Kuverts und Pickerl, Besonderheiten."
            multiline
            onChangeText={setNote}
            placeholder="Kurz beschreiben…"
            style={styles.multiline}
            value={note}
          />

          <Button
            busy={busy}
            label="Bericht abschicken"
            onPress={() => void submit()}
          />

          <View style={styles.signOut}>
            <Button label="Abmelden" onPress={confirmSignOut} variant="danger" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.inkSubtle, fontSize: 15, marginBottom: 18, marginTop: 4 },
  row: { flexDirection: 'row', paddingVertical: 7 },
  rowLabel: { color: colors.inkSubtle, flex: 1, fontSize: 14 },
  rowValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  blockedHint: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 10 },
  syncAction: { marginTop: 12 },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  signOut: { marginTop: 28 }
});
